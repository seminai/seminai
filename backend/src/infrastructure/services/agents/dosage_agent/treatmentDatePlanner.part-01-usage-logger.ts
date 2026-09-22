import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmCacheService } from './llmCacheService';
import { prisma } from '../../../repositories/Prisma';
import { LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { z } from 'zod';
import { DosageAgentContext } from './context';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';

export const usageLogger = LlmUsageLogger.getInstance();

export const llmCacheService = new LlmCacheService(prisma, 5);

// Incrementare questa variabile in caso venga variato il prompt -> serve a invaldiare cache in prisma
export const PHENOLOGY_PROMPT_VERSION = 'phenology-dates-v1';

export const DATE_RANGE_PROMPT_VERSION = 'date-range-v1';

export const DOSAGE_DETAILS_PROMPT_VERSION = 'dosage-details-v1';

export const PLANNER_CACHE_TTL_MS = 30 * 60 * 1000;

export const PLANNER_CACHE_MAX_SIZE = 500;

/**
 * OPTIMIZATION: Caches for LLM responses
 * These caches store results to avoid redundant LLM calls for the same data
 */

export interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

// Cache for buildCompleteCycle: bounded with TTL to avoid stale phenology data.
export const completeCycleCache = new Map<string, CacheEntry<CompleteCycle>>();

// Cache for findDosageDetails: bounded with TTL to avoid unbounded growth.
export const dosageDetailsCache = new Map<string, CacheEntry<ReadonlyArray<LabelDoseDetail>>>();

export function getCachedPlannerValue<T>(
  cache: Map<string, CacheEntry<T>>,
  cacheKey: string,
): T | undefined {
  const entry = cache.get(cacheKey);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return undefined;
  }
  return entry.value;
}

export function setCachedPlannerValue<T>(
  cache: Map<string, CacheEntry<T>>,
  cacheKey: string,
  value: T,
): void {
  if (cache.size >= PLANNER_CACHE_MAX_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + PLANNER_CACHE_TTL_MS,
  });
}

/**
 * Extract JSON from LLM response that may contain extra text
 */
export function extractJsonFromResponse(content: string): string {
  const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) {
    throw new Error('No JSON object found in response');
  }
  let braceCount = 0;
  let lastBrace = -1;
  for (let i = firstBrace; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      braceCount++;
    } else if (cleaned[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        lastBrace = i;
        break;
      }
    }
  }
  if (lastBrace === -1) {
    throw new Error('Unclosed JSON object in response');
  }
  return cleaned.substring(firstBrace, lastBrace + 1);
}

/**
 * Clear all caches - useful for testing or when starting a new job
 */
export function clearTreatmentPlannerCaches(): void {
  completeCycleCache.clear();
  dosageDetailsCache.clear();
  console.log('[CACHE] Treatment planner caches cleared');
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): { completeCycleSize: number; dosageDetailsSize: number } {
  return {
    completeCycleSize: completeCycleCache.size,
    dosageDetailsSize: dosageDetailsCache.size,
  };
}

/**
 * Production unit cycle - dates can be undefined if user didn't set them
 */
export interface ProductionUnitCycle {
  readonly cropName: string;
  readonly variety?: string;
  readonly location?: string;
  readonly startDate?: Date;
  readonly floweringDate?: Date;
  readonly harvestingDate?: Date;
  readonly endDate?: Date;
}

/**
 * Complete cycle with all dates filled (from user or LLM)
 */
export interface CompleteCycle {
  readonly cropName: string;
  readonly variety?: string;
  readonly startDate: Date;
  readonly floweringDate: Date;
  readonly harvestingDate: Date;
  readonly endDate: Date;
}

/**
 * Schema for phenological dates from LLM
 */
export const PhenologicalDatesSchema = z.object({
  startDate: z.string(),
  floweringDate: z.string(),
  harvestingDate: z.string(),
  endDate: z.string(),
});

/**
 * Get default phenological dates for a crop via LLM
 */
export async function getPhenologicalDates(
  cropName: string,
  variety?: string,
  location?: string,
  context?: DosageAgentContext,
): Promise<z.infer<typeof PhenologicalDatesSchema> | null> {
  const tracker = usageLogger.createTracker();
  const parser = StructuredOutputParser.fromZodSchema(PhenologicalDatesSchema);
  const formatInstructions = parser.getFormatInstructions();

  const year = new Date().getFullYear();
  const prevYear = year - 1;
  const loc = location || 'Italia';

  const prompt = `Sei un agronomo esperto. Determina le date fenologiche tipiche per la coltura indicata.

COLTURA: ${cropName} ${variety || ''}
ZONA: ${loc}
ANNO DI RACCOLTA: ${year}

DEFINIZIONE DEI CAMPI:
- startDate: data di SEMINA o TRAPIANTO (inizio del ciclo colturale)
- floweringDate: data di FIORITURA (o spigatura per i cereali)
- harvestingDate: data di RACCOLTA
- endDate: data di fine ciclo (solitamente coincide con la raccolta)

IMPORTANTE - COLTURE AUTUNNO-VERNINE:
Per cereali autunno-vernini (frumento tenero, frumento duro, orzo, avena, segale, triticale):
- La SEMINA avviene in AUTUNNO dell'anno PRECEDENTE (${prevYear})
- La RACCOLTA avviene in estate dell'anno corrente (${year})
- Esempio frumento: startDate="${prevYear}-10-20", floweringDate="${year}-05-15", harvestingDate="${year}-06-25", endDate="${year}-06-25"

COLTURE PRIMAVERILI-ESTIVE:
Per mais, sorgo, soia, pomodoro, melone, zucchino:
- Semina e raccolta nello stesso anno (${year})
- Esempio mais: startDate="${year}-04-15", floweringDate="${year}-07-20", harvestingDate="${year}-09-25", endDate="${year}-09-25"

COLTURE PERENNI (vite, melo, pero, pesco, olivo, agrumi):
- startDate = data di ripresa vegetativa/germogliamento (${year})
- Esempio vite: startDate="${year}-03-15", floweringDate="${year}-06-01", harvestingDate="${year}-09-20", endDate="${year}-10-15"

{format_instructions}`;

  try {
    const { result: parsed, usedModel } = await callWithFallback<
      z.infer<typeof PhenologicalDatesSchema>
    >({
      operation: 'treatment-planning',
      context,
      modelOptions: { temperature: 0 },
      execute: async (llm, modelName) => {
        // Include userId/companyId in cache key for data isolation between users
        const userId = context?.userId || 'anonymous';
        const companyId = context?.companyId || null;
        const cacheKey = `phenology:${LlmCacheService.createStableHash({
          userId,
          companyId,
          cropName: cropName.toLowerCase(),
          variety: (variety || '').toLowerCase(),
          location: loc.toLowerCase(),
          year,
          modelName,
          promptVersion: PHENOLOGY_PROMPT_VERSION,
        })}`;

        const cacheResult = await llmCacheService.getOrRefresh<
          z.infer<typeof PhenologicalDatesSchema>
        >({
          namespace: 'phenology-dates',
          cacheKey,
          model: modelName,
          promptVersion: PHENOLOGY_PROMPT_VERSION,
          userId: context?.userId,
          computeScore: (payload) => {
            const values = [
              payload.startDate,
              payload.floweringDate,
              payload.harvestingDate,
              payload.endDate,
            ];
            return values.filter((v) => typeof v === 'string' && v.trim().length > 0).length;
          },
          fetchFresh: async () => {
            const response = await llm.invoke(
              prompt.replace('{format_instructions}', formatInstructions),
              {
                callbacks: tracker.callbacks,
              },
            );
            const content = extractResponseText(response.content);
            try {
              return await parser.parse(content);
            } catch (primaryErr) {
              const repairPrompt = `You must output ONLY valid JSON that matches these format instructions:
${formatInstructions}

The previous output was invalid. Fix it and output ONLY the corrected JSON.

INVALID_OUTPUT:
${content}`;
              const repaired = await llm.invoke(repairPrompt, { callbacks: tracker.callbacks });
              const repairedContent = extractResponseText(repaired.content);
              const reparsed = await parser.parse(repairedContent);
              console.warn(
                `[PHENOLOGY] LLM output repaired: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}`,
              );
              return reparsed;
            }
          },
        });
        return cacheResult.payload;
      },
    });
    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: { step: 'phenology-dates', cropName, variety, location: loc },
    });
    return parsed;
  } catch (err) {
    console.error('[PHENOLOGY] LLM failed:', err);
    return null;
  }
}
