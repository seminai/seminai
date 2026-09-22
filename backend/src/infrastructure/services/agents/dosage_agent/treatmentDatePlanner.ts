import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { callWithFallback, extractResponseText } from './llmProvider';
import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { needsTimingInference, inferAndPlanApplications } from './applicationTimingInferrer';
import { DosageAgentContext } from './context';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { LlmCacheService } from './llmCacheService';
import { PlanningWindow } from './planningWindow';
import { mapEpocaToApplicationDates, BbchDateRange } from './bbchPhenologyMapper';
import { enrichDosageDetailsFromBdf } from './bdfDosageEnricher';
import type { TreatmentStrategyHint } from './treatmentStrategyPlanner';

const usageLogger = LlmUsageLogger.getInstance();
const llmCacheService = new LlmCacheService(prisma, 5);
// Incrementare questa variabile in caso venga variato il prompt -> serve a invaldiare cache in prisma
const PHENOLOGY_PROMPT_VERSION = 'phenology-dates-v1';
const DATE_RANGE_PROMPT_VERSION = 'date-range-v1';
const DOSAGE_DETAILS_PROMPT_VERSION = 'dosage-details-v1';
const PLANNER_CACHE_TTL_MS = 30 * 60 * 1000;
const PLANNER_CACHE_MAX_SIZE = 500;

/**
 * OPTIMIZATION: Caches for LLM responses
 * These caches store results to avoid redundant LLM calls for the same data
 */

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

// Cache for buildCompleteCycle: bounded with TTL to avoid stale phenology data.
const completeCycleCache = new Map<string, CacheEntry<CompleteCycle>>();

// Cache for findDosageDetails: bounded with TTL to avoid unbounded growth.
const dosageDetailsCache = new Map<string, CacheEntry<ReadonlyArray<LabelDoseDetail>>>();

function getCachedPlannerValue<T>(
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

function setCachedPlannerValue<T>(
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
function extractJsonFromResponse(content: string): string {
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
const PhenologicalDatesSchema = z.object({
  startDate: z.string(),
  floweringDate: z.string(),
  harvestingDate: z.string(),
  endDate: z.string(),
});

/**
 * Get default phenological dates for a crop via LLM
 */
async function getPhenologicalDates(
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

/**
 * Build complete cycle: use user dates if available, otherwise get from LLM
 * EXPORTED so it can be called once per unit (not per product)
 * OPTIMIZATION: Uses cache for LLM-derived phenological dates
 */
export async function buildCompleteCycle(
  unit: ProductionUnitCycle,
  context?: DosageAgentContext,
): Promise<CompleteCycle | null> {
  const hasAllDates = unit.startDate && unit.harvestingDate;

  if (hasAllDates) {
    // User provided dates - use them directly (no caching needed)
    const start = unit.startDate!;
    const harvest = unit.harvestingDate!;
    const midpoint = new Date((start.getTime() + harvest.getTime()) / 2);
    let flowering = unit.floweringDate || midpoint;

    // Sanitize: if floweringDate is after harvestingDate, it's a data error
    // (e.g., user entered 2027-03-14 with harvest 2026-09-09).
    // Fall back to midpoint between start and harvest which is a reasonable default.
    if (flowering > harvest) {
      console.warn(
        `[PHENOLOGY] floweringDate (${flowering.toISOString().split('T')[0]}) is after harvestingDate (${harvest.toISOString().split('T')[0]}) for ${unit.cropName}. Using midpoint ${midpoint.toISOString().split('T')[0]} instead.`,
      );
      flowering = midpoint;
    }

    const end = unit.endDate || harvest;
    return {
      cropName: unit.cropName,
      variety: unit.variety,
      startDate: start,
      floweringDate: flowering,
      harvestingDate: harvest,
      endDate: end,
    };
  }

  // Need to fetch from LLM - check cache first
  const planningYear = new Date().getFullYear();
  const cacheKey = `${PHENOLOGY_PROMPT_VERSION}|${planningYear}|${unit.cropName.toLowerCase()}|${(unit.variety || '').toLowerCase()}|${(unit.location || 'italia').toLowerCase()}`;

  const cached = getCachedPlannerValue(completeCycleCache, cacheKey);
  if (cached) {
    console.log(`[PHENOLOGY] Cache hit for ${unit.cropName}/${unit.variety || 'default'}`);
    return {
      ...cached,
      cropName: unit.cropName,
      variety: unit.variety,
    };
  }

  console.log(`[PHENOLOGY] Cache miss for ${unit.cropName}, fetching from LLM...`);
  const dates = await getPhenologicalDates(unit.cropName, unit.variety, unit.location, context);
  if (!dates) return null;

  const completeCycle: CompleteCycle = {
    cropName: unit.cropName,
    variety: unit.variety,
    startDate: new Date(dates.startDate),
    floweringDate: new Date(dates.floweringDate),
    harvestingDate: new Date(dates.harvestingDate),
    endDate: new Date(dates.endDate),
  };

  // Store in cache for future units with the same crop
  setCachedPlannerValue(completeCycleCache, cacheKey, completeCycle);
  console.log(`[PHENOLOGY] Cached cycle for ${cacheKey} (cache size: ${completeCycleCache.size})`);

  return completeCycle;
}

/**
 * Schema for LLM response - Step 1: Date Range
 */
const DateRangeSchema = z.object({
  startDate: z.string().describe('YYYY-MM-DD'),
  endDate: z.string().describe('YYYY-MM-DD'),
  isOutsideProduction: z.boolean(),
  reason: z.string(),
});

/**
 * Schema for LLM response - Step 2: Treatment Schedule
 */
const TreatmentScheduleSchema = z.object({
  applications: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD'),
      epoch: z.string(),
      isLocalized: z.boolean(),
      notes: z.string(),
    }),
  ),
});

export type DateRangeResult = z.infer<typeof DateRangeSchema>;
export type TreatmentScheduleResult = z.infer<typeof TreatmentScheduleSchema>;

/**
 * Step 1: Determine date range based on label and complete cycle.
 * Includes outside-production check in a single LLM call when needed.
 * cycle must be pre-built via buildCompleteCycle (called once per unit)
 */
export async function determineDateRange(
  label: Label,
  cycle: CompleteCycle,
  context?: DosageAgentContext,
): Promise<DateRangeResult | null> {
  const coltureOutside = label.colture_target_fuori_periodo_di_prodizione || [];

  // Prisma cache key: same crop/cycle/outside-crops → same result
  const cacheKey = `dateRange:${LlmCacheService.createStableHash({
    userId: context?.userId || 'anonymous',
    cropName: cycle.cropName.toLowerCase(),
    variety: (cycle.variety || '').toLowerCase(),
    startDate: cycle.startDate.toISOString().split('T')[0],
    endDate: cycle.endDate.toISOString().split('T')[0],
    coltureOutside: coltureOutside.map((c) => c.toLowerCase()).sort(),
    promptVersion: DATE_RANGE_PROMPT_VERSION,
  })}`;

  try {
    const cacheResult = await llmCacheService.getOrRefresh<DateRangeResult>({
      namespace: 'date-range',
      cacheKey,
      model: 'date-range',
      promptVersion: DATE_RANGE_PROMPT_VERSION,
      userId: context?.userId,
      computeScore: (p) => (p.startDate ? 2 : 0) + (p.endDate ? 2 : 0) + (p.reason ? 1 : 0),
      fetchFresh: async () => {
        const tracker = usageLogger.createTracker();

        // Build the outside-production section for the prompt
        const outsideSection =
          coltureOutside.length > 0
            ? `\nCOLTURE FUORI PERIODO DI PRODUZIONE (da etichetta):
${coltureOutside.map((c, i) => `${i + 1}. ${c}`).join('\n')}

REGOLE FUORI PERIODO:
- Controlla se la coltura target è esplicitamente menzionata nella lista o appartiene a una categoria generale menzionata (es. "cereali", "orticole")
- "TERRENI IN ASSENZA DI COLTURE" significa applicazione pre-semina/pre-trapianto
- Se c'è match → isOutsideProduction=true, il range deve essere pre-semina (prima della semina) o post-raccolta (dopo la raccolta)
- Se NON c'è match → isOutsideProduction=false, il range deve coprire il ciclo produttivo\n`
            : '';

        const prompt = `Sei un agronomo. Determina il range di date per applicare un prodotto fitosanitario.

COLTURA: ${cycle.cropName} ${cycle.variety || ''}
CICLO PRODUTTIVO:
- Inizio (semina): ${cycle.startDate.toISOString().split('T')[0]}
- Fioritura: ${cycle.floweringDate.toISOString().split('T')[0]}
- Raccolta: ${cycle.harvestingDate.toISOString().split('T')[0]}
- Fine: ${cycle.endDate.toISOString().split('T')[0]}
${outsideSection}
COMPITI:
1. ${coltureOutside.length > 0 ? 'Verifica se la coltura target è nella lista colture fuori periodo' : 'Nessuna coltura fuori periodo specificata in etichetta (isOutsideProduction=false)'}
2. Determina il range di date appropriato per l'applicazione

Rispondi SOLO JSON:
{"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","isOutsideProduction":boolean,"reason":"breve spiegazione"}`;

        const { result, usedModel } = await callWithFallback<DateRangeResult>({
          operation: 'date-range',
          context,
          modelOptions: { temperature: 0 },
          execute: async (llm) => {
            const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
            const content = extractResponseText(response.content);
            const json = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
            return DateRangeSchema.parse(json);
          },
        });
        await usageLogger.logFromAccumulator(tracker.accumulator, {
          userId: context?.userId,
          companyId: context?.companyId,
          jobId: context?.jobId,
          jobGroupId: context?.jobGroupId,
          jobType: context?.jobType ?? LlmJobType.DOSAGE,
          model: usedModel,
          metadata: { step: 'determine-date-range', cropName: cycle.cropName },
        });
        return result;
      },
    });

    console.log(
      `[DATE-RANGE] ${cycle.cropName}: ${cacheResult.payload.startDate} - ${cacheResult.payload.endDate}, outsideProduction: ${cacheResult.payload.isOutsideProduction} [cache: ${cacheResult.fromCache}]. ${cacheResult.payload.reason}`,
    );

    return cacheResult.payload;
  } catch (err) {
    console.error('[DATE-RANGE] LLM failed:', err);
    return null;
  }
}

/**
 * Step 2: Plan treatment applications within date range
 * cycle must be pre-built via buildCompleteCycle (called once per unit)
 *
 * If epoca_impiego is not specified in dosageDetails, it will use LLM inference
 * to determine the best application timing based on product type and diseases.
 */
export async function planApplications(
  dateRange: DateRangeResult,
  dosageDetails: ReadonlyArray<LabelDoseDetail>,
  cycle: CompleteCycle,
  labelDiseases?: ReadonlyArray<string>,
  label?: Label,
  context?: DosageAgentContext,
  strategyHint?: TreatmentStrategyHint,
  agronomicContext?: { agronomicNotes?: string; priorityTargets?: string[] },
): Promise<TreatmentScheduleResult> {
  // Check if any dosageDetail needs timing inference (epoca_impiego is null/empty)
  const detailsNeedingInference = dosageDetails.filter(needsTimingInference);
  const hasTimingSpecified = dosageDetails.some((d) => !needsTimingInference(d));

  // If ALL dosageDetails lack epoca_impiego and we have the label, use inference
  if (detailsNeedingInference.length > 0 && !hasTimingSpecified && label) {
    console.log(
      `[PLAN-APPS] epoca_impiego not specified for ${label.prodotto}. Using LLM inference...`,
    );

    // Use the first dosageDetail for inference (they should have same constraints)
    const primaryDetail = dosageDetails[0];
    const inferredPlan = await inferAndPlanApplications(label, primaryDetail, cycle, context);

    if (inferredPlan.applications.length > 0) {
      console.log(
        `[PLAN-APPS] Inferred ${inferredPlan.totalApplications} applications: ${inferredPlan.reasoning}`,
      );

      return {
        applications: inferredPlan.applications.map((app) => ({
          date: app.date,
          epoch: app.phase,
          isLocalized: app.isLocalized,
          notes: app.notes,
        })),
      };
    }

    console.warn(`[PLAN-APPS] Inference returned no applications for ${label.prodotto}`);
  }

  // BBCH-BASED PATH: Use BBCH scale for precise phenological stage mapping
  // Try BBCH mapping for any epoca_impiego - the LLM will handle all crop types
  const dosageWithEpoca = dosageDetails.find((d) => d.epoca_impiego?.trim());
  if (dosageWithEpoca) {
    console.log(
      `[PLAN-APPS] Trying BBCH mapping for epoca_impiego: "${dosageWithEpoca.epoca_impiego}"...`,
    );

    const bbchDateRange = await mapEpocaToApplicationDates(
      dosageWithEpoca,
      cycle.cropName,
      cycle,
      context,
    );

    if (bbchDateRange) {
      console.log(
        `[PLAN-APPS] BBCH mapping successful: ${bbchDateRange.startDate} to ${bbchDateRange.endDate} (BBCH ${bbchDateRange.bbchStart}-${bbchDateRange.bbchEnd})`,
      );

      // Plan applications within the BBCH-derived date range
      const bbchApplications = await planApplicationsWithBbchDates(
        bbchDateRange,
        dosageDetails,
        cycle,
        label,
        context,
      );

      if (bbchApplications.applications.length > 0) {
        return bbchApplications;
      }

      console.warn(
        `[PLAN-APPS] BBCH-based planning returned no applications, falling back to standard path`,
      );
    }
  }

  // Standard path: epoca_impiego is specified, use the original logic
  const tracker = usageLogger.createTracker();

  // Aggregate info from ALL dosageDetails (not just first one)
  const allDiseases = [...new Set(dosageDetails.map((d) => d.malattia).filter(Boolean))];
  const maxAppsWithValues = dosageDetails
    .map((d) => d.n_max_applicazioni)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const maxApps = maxAppsWithValues.length > 0 ? Math.max(...maxAppsWithValues) : null;

  // Use most restrictive constraints
  const intervalsMin = dosageDetails
    .map((d) => d.intervallo_min_giorni)
    .filter((v): v is number => v != null);
  const intervalMin = intervalsMin.length > 0 ? Math.max(...intervalsMin) : 7;

  const safetyDaysAll = dosageDetails
    .map((d) => d.intervallo_sicurezza_giorni)
    .filter((v): v is number => v != null);
  const safetyDays = safetyDaysAll.length > 0 ? Math.max(...safetyDaysAll) : 0;

  // Combine diseases from dosageDetails and label
  const diseaseInfo = [...allDiseases];
  if (labelDiseases && labelDiseases.length > 0) {
    diseaseInfo.push(...labelDiseases.slice(0, 5));
  }
  const uniqueDiseases = [...new Set(diseaseInfo)];

  // Build detailed dosage info text for LLM
  const dosageDetailsText = dosageDetails
    .map((d, i) => {
      const parts = [`${i + 1}. ${d.malattia || 'Generica'}`];
      if (d.epoca_impiego) parts.push(`epoca "${d.epoca_impiego}"`);
      if (d.n_max_applicazioni) parts.push(`Max app: ${d.n_max_applicazioni}`);
      if (d.intervallo_min_giorni) parts.push(`Intervallo: ${d.intervallo_min_giorni} gg`);
      if (d.intervallo_sicurezza_giorni) parts.push(`PHI: ${d.intervallo_sicurezza_giorni} gg`);
      if (d.istruzioni) parts.push(`Istruzioni: "${d.istruzioni}"`);
      if (d.modalita_applicazione) parts.push(`Modalità: "${d.modalita_applicazione}"`);
      return parts.join('\n   - ');
    })
    .join('\n');

  const globalInfo = [
    label?.note_tecniche ? `NOTE TECNICHE: ${label.note_tecniche}` : '',
    label?.caratteristiche ? `CARATTERISTICHE: ${label.caratteristiche}` : '',
    label?.avvertenze && label.avvertenze.length > 0
      ? `AVVERTENZE: ${label.avvertenze.join('; ').slice(0, 500)}...`
      : '',
    label?.fitotossicita ? `FITOTOSSICITÀ: ${label.fitotossicita}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const diseasesText =
    uniqueDiseases.length > 0 ? `\n- Malattie/Avversità target: ${uniqueDiseases.join(', ')}` : '';

  // Build strategy hint section if available
  const strategyHintText = strategyHint
    ? `\nSTRATEGIA COORDINATA (dal planner strategico):
- Ruolo di questo prodotto: ${strategyHint.role} (${strategyHint.reasoning})
- Applicazioni suggerite: ${strategyHint.suggestedApplicationCount}
- Periodo suggerito: ${strategyHint.suggestedPeriod.start} - ${strategyHint.suggestedPeriod.end}
Usa queste indicazioni come GUIDA per il numero e timing delle applicazioni.\n`
    : '';

  // Build agronomic context section if available
  const agronomicContextText = [
    agronomicContext?.agronomicNotes ? `NOTE AGRONOMO: ${agronomicContext.agronomicNotes}` : '',
    agronomicContext?.priorityTargets?.length
      ? `AVVERSITÀ PRIORITARIE: ${agronomicContext.priorityTargets.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const agronomicSection = agronomicContextText ? `\n${agronomicContextText}\n` : '';

  const prompt = `Sei un agronomo esperto. Pianifica le applicazioni di un prodotto fitosanitario rispettando RIGOROSAMENTE l'epoca di impiego indicata in etichetta.

PRODOTTO: ${label?.prodotto || 'Prodotto fitosanitario'}
CATEGORIA: ${label?.categoria || 'Non specificata'}
COLTURA: ${cycle.cropName} ${cycle.variety || ''}

${globalInfo}
${strategyHintText}${agronomicSection}
CICLO FENOLOGICO COMPLETO:
- Semina/Inizio ciclo: ${cycle.startDate.toISOString().split('T')[0]}
- Fioritura: ${cycle.floweringDate.toISOString().split('T')[0]}
- Raccolta: ${cycle.harvestingDate.toISOString().split('T')[0]}
- Fine ciclo: ${cycle.endDate.toISOString().split('T')[0]}

RANGE DATE APPLICABILE (da etichetta): ${dateRange.startDate} - ${dateRange.endDate}

VINCOLI ETICHETTA (aggregati da tutti i dosaggi):
- Max applicazioni totali: ${maxApps !== null ? maxApps : 'Non specificato in etichetta/BDF - usa giudizio agronomico'}
- Intervallo minimo tra applicazioni: ${intervalMin} giorni
- Intervallo sicurezza pre-raccolta (PHI): ${safetyDays} giorni${diseasesText}

DETTAGLIO DOSAGGI PER MALATTIA/EPOCA:
${dosageDetailsText}

REGOLE CRITICHE:
⚠️ IMPORTANTE - INTERPRETAZIONE EPOCHE MULTIPLE:
Se l'epoca_impiego contiene frasi come:
- "prima della semina O dopo il raccolto" / "prima del trapianto O dopo il raccolto"
- "dopo il raccolto" / "dopo raccolta" / "dopo la raccolta"
- "a fine ciclo" / "fine ciclo" / "al termine del ciclo"
- "post-raccolta"
→ Queste indicano SEMPRE applicazione POST-RACCOLTA (DOPO la raccolta), NON pre-raccolta!
→ "pre-raccolta" = PRIMA della raccolta (settimane prima, rispettando PHI)
→ "post-raccolta" / "dopo il raccolto" / "fine ciclo" = DOPO la raccolta (quando il terreno è vuoto)
→ Per colture raccolte in estate (es. frumento a luglio), applica DOPO la raccolta (luglio-agosto)
→ Per colture raccolte in autunno (es. mais a settembre-ottobre), applica DOPO la raccolta (ottobre-novembre)

1. INTERPRETA CORRETTAMENTE L'EPOCA DI IMPIEGO IN BASE AL TIPO DI COLTURA:
   
   COLTURE ANNUALI (cereali, orticole):
   - "pre-semina" = prima della semina, preparazione del terreno
   - "pre-emergenza" = dopo la semina ma prima che la pianta emerga dal terreno
   - "post-emergenza" = dopo l'emergenza ma prima della fioritura.
     SPECIFICO PER CEREALI AUTUNNO-VERNINI (frumento, orzo):
     - "Post-emergenza" erbicida avviene tipicamente in AUTUNNO/INVERNO (Nov-Gen) o INIZIO PRIMAVERA (Feb-Mar, accestimento/levata).
     - EVITARE ASSOLUTAMENTE applicazioni di erbicidi "post-emergenza" in fase avanzata (Mag-Giu, spigatura/maturazione) a meno che non sia specificato "pre-raccolta".
   - "pre-fioritura" = fino a 7-14 giorni prima della fioritura
   - "fioritura" = durante il periodo di fioritura
   - "post-fioritura" = dopo fioritura fino a pre-raccolta
   - "pre-raccolta" = nelle settimane PRIMA della raccolta (rispettando PHI) - ⚠️ NON confondere con "dopo il raccolto"!
   - "post-raccolta" / "dopo il raccolto" / "dopo raccolta" / "fine ciclo" = DOPO la raccolta, quando il terreno è vuoto
   
   COLTURE PERENNI (frutticole, vite):
   - "riposo vegetativo" = inverno, pianta dormiente (dicembre-febbraio)
   - "germogliamento" = apertura gemme (febbraio-marzo)
   - "pre-fioritura" = bottoni fiorali visibili ma chiusi (7-14 giorni prima fioritura)
   - "fioritura" = fiori aperti
   - "allegagione" = caduta petali, formazione frutticini (subito dopo fioritura)
   - "ingrossamento frutti" = crescita attiva dei frutti (maggio-luglio)
   - "invaiatura" = inizio maturazione frutti (cambio colore)
   - "pre-raccolta" = 7-30 giorni PRIMA raccolta (rispettando PHI) - ⚠️ NON confondere con "dopo il raccolto"!
   - "post-raccolta" / "dopo il raccolto" / "dopo raccolta" / "fine ciclo" = DOPO raccolta, prima della caduta foglie

   
2. PIANIFICA I TRATTAMENTI considerando TUTTE le malattie/epoche elencate sopra:
   - Se epoca_impiego contiene più opzioni separate da "O" / "o" / "oppure" (es. "prima della semina O dopo il raccolto"):
     → Analizza quale opzione è più appropriata in base alla data di raccolta:
     * Se la raccolta è già passata o è imminente → scegli "post-raccolta" (DOPO la raccolta)
     * Se la semina è imminente → scegli "pre-semina"
     * Se entrambe sono possibili, preferisci "post-raccolta" per colture già raccolte o prossime alla raccolta
     * ⚠️ NON scegliere mai "pre-raccolta" quando l'etichetta dice "dopo il raccolto" o "fine ciclo"!
   - Se epoche diverse si sovrappongono temporalmente → un trattamento copre più malattie
   - Se epoche sono separate → pianifica trattamenti distinti
   - Ottimizza il numero di trattamenti rispettando i vincoli
   
3. Le date DEVONO ricadere dentro il range applicabile E rispettare le epoche specifiche
4. ${maxApps !== null ? `Rispetta SEMPRE il numero massimo di applicazioni totali (${maxApps})` : 'Il numero massimo applicazioni NON è specificato in etichetta/BDF. Pianifica il numero agronomicamente appropriato per questa coltura e avversità (per fungicidi di copertura su arboree, tipicamente 4-8 nel periodo critico).'}
5. Rispetta l'intervallo minimo di ${intervalMin} giorni tra applicazioni
6. ⚠️ ATTENZIONE: Se l'epoca è "post-raccolta" / "dopo il raccolto" / "fine ciclo", NON applicare il vincolo PHI (intervallo sicurezza pre-raccolta) perché il trattamento avviene DOPO la raccolta!
7. Date allineate al lunedì (granularità settimanale)
8. Nelle note, specifica CORRETTAMENTE la fase fenologica:
   - Se l'epoca è "post-raccolta" / "dopo il raccolto" / "fine ciclo" → scrivi "Post-raccolta" nelle note
   - Se l'epoca è "pre-raccolta" → scrivi "Pre-raccolta" nelle note
   - ⚠️ NON confondere "pre-raccolta" (prima della raccolta) con "post-raccolta" (dopo la raccolta)!

ESEMPIO PER MULTIPLE MALATTIE:
Se hai: Fusariosi (spigatura-fioritura), Ruggini+Septoria (levata-fioritura)
→ Pianifica 2 trattamenti: uno in levata (Ruggini, Septoria), uno in spigatura (Fusariosi)

Rispondi SOLO JSON:
{"applications":[{"date":"YYYY-MM-DD","epoch":"levata/spigatura/etc","isLocalized":false,"notes":"Fase fenologica, malattie target: [elenco specifico]"}]}`;

  try {
    const { result, usedModel } = await callWithFallback<TreatmentScheduleResult>({
      operation: 'treatment-planning',
      context,
      modelOptions: { temperature: 0 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
        const content = extractResponseText(response.content);
        const jsonString = extractJsonFromResponse(content);
        const json = JSON.parse(jsonString);
        return TreatmentScheduleSchema.parse(json);
      },
    });
    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: { step: 'plan-applications', cropName: cycle.cropName },
    });
    return result;
  } catch (err) {
    console.error('[PLAN-APPS] LLM failed:', err);
    return { applications: [] };
  }
}

/**
 * Find dosage details for crop using LLM semantic matching
 * The LLM matches scientific names (e.g., "Coriandrum sativum") to label names (e.g., "coriandolo", "erbe aromatiche")
 * OPTIMIZATION: Uses cache for LLM-derived matches
 */
export async function findDosageDetails(
  label: Label,
  cropName: string,
  context?: DosageAgentContext,
  skipCropFilter?: boolean,
): Promise<ReadonlyArray<LabelDoseDetail>> {
  const dosaggi = label.dosaggi_dettagliati || [];
  if (dosaggi.length === 0) return [];

  // When dosaggi are already filtered upstream (by LLM matchedCrops in flowMatchCropTreatment),
  // skip the redundant crop-name re-matching that can fail for scientific vs common names
  if (skipCropFilter) {
    console.log(
      `[FIND-DOSAGE] Returning all ${dosaggi.length} pre-filtered dosaggi for ${cropName}`,
    );
    return dosaggi;
  }

  // Quick mechanical check first
  const normalized = cropName.toLowerCase();
  const mechanicalMatch = dosaggi.filter((d) => d.coltura.toLowerCase().includes(normalized));
  if (mechanicalMatch.length > 0) {
    console.log(`[FIND-DOSAGE] Mechanical match for ${cropName}: ${mechanicalMatch.length} found`);
    return mechanicalMatch;
  }

  // OPTIMIZATION: Check cache before calling LLM
  const productId = label.numero_registrazione || label.prodotto || '';
  const cacheKey = `${DOSAGE_DETAILS_PROMPT_VERSION}|${productId.toLowerCase()}|${cropName.toLowerCase()}`;

  const cached = getCachedPlannerValue(dosageDetailsCache, cacheKey);
  if (cached) {
    console.log(
      `[FIND-DOSAGE] Cache hit for ${label.prodotto}/${cropName}: ${cached.length} dosaggi`,
    );
    return cached;
  }

  // LLM semantic matching with Prisma persistent cache
  const coltureInLabel = dosaggi.map((d) => d.coltura);
  const uniqueColture = [...new Set(coltureInLabel)];

  // Prisma cache key: same crop + same set of colture in label → same LLM match result
  const prismaCacheKey = `dosageDetails:${LlmCacheService.createStableHash({
    userId: context?.userId || 'anonymous',
    cropName: cropName.toLowerCase(),
    colture: uniqueColture.map((c) => c.toLowerCase()).sort(),
    promptVersion: DOSAGE_DETAILS_PROMPT_VERSION,
  })}`;

  try {
    const cacheResult = await llmCacheService.getOrRefresh<{ indices: number[]; reason: string }>({
      namespace: 'dosage-details',
      cacheKey: prismaCacheKey,
      model: 'dosage-details',
      promptVersion: DOSAGE_DETAILS_PROMPT_VERSION,
      userId: context?.userId,
      computeScore: (payload) => payload.indices.length,
      fetchFresh: async () => {
        const tracker = usageLogger.createTracker();

        const prompt = `Sei un agronomo esperto. Devi trovare quale coltura nell'etichetta corrisponde alla coltura target.

COLTURA TARGET: ${cropName}

COLTURE PRESENTI IN ETICHETTA:
${uniqueColture.map((c, i) => `${i + 1}. ${c}`).join('\n')}

REGOLE CRITICHE:
1. La coltura target può essere indicata con:
   - Nome scientifico latino (es. "Triticum aestivum" = "Frumento", "Zea mays" = "Mais", "Vitis vinifera" = "Vite", "Solanum lycopersicum" = "Pomodoro", "Malus domestica" = "Melo", "Hordeum vulgare" = "Orzo", "Coriandrum sativum" = "Coriandolo")
   - Nome comune italiano (es. "Frumento", "Grano tenero", "Mais")
   - Varietà o sottospecie (es. "TRITI_AES" = Triticum aestivum = Frumento tenero)
2. L'etichetta può usare:
   - Nome comune (es. "frumento", "mais", "vite")
   - Categoria generica che INCLUDE la coltura (es. "cereali" include frumento, orzo, mais; "orticole" include pomodoro, peperone)
   - Nome specifico diverso ma equivalente (es. "grano" = "frumento")
3. Trova TUTTE le corrispondenze valide (anche categorie generiche che includono la coltura)
4. In caso di dubbio, INCLUDI la corrispondenza (meglio includere un falso positivo che escludere un vero match)

Rispondi SOLO JSON con gli indici (1-based) delle colture corrispondenti:
{"matchedIndices":[1,3],"reason":"breve spiegazione"}

Se nessuna coltura corrisponde:
{"matchedIndices":[],"reason":"nessuna corrispondenza"}`;

        const { result: matchResult, usedModel } = await callWithFallback<{
          indices: number[];
          reason: string;
        }>({
          operation: 'dosage-details',
          context,
          modelOptions: { temperature: 0 },
          execute: async (llm) => {
            const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
            const content = extractResponseText(response.content);
            const json = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
            return { indices: json.matchedIndices || [], reason: json.reason || '' };
          },
        });
        await usageLogger.logFromAccumulator(tracker.accumulator, {
          userId: context?.userId,
          companyId: context?.companyId,
          jobId: context?.jobId,
          jobGroupId: context?.jobGroupId,
          jobType: context?.jobType ?? LlmJobType.DOSAGE,
          model: usedModel,
          metadata: { step: 'find-dosage-details', cropName, matched: matchResult.indices.length },
        });
        return matchResult;
      },
    });

    const matchResult = cacheResult.payload;

    if (matchResult.indices.length === 0) {
      console.log(
        `[FIND-DOSAGE] No match for ${cropName} [cache: ${cacheResult.fromCache}]. Reason: ${matchResult.reason}`,
      );
      setCachedPlannerValue(dosageDetailsCache, cacheKey, []);
      return [];
    }

    // Map indices to colture names, then filter dosaggi
    const matchedColture = matchResult.indices
      .filter((i) => i >= 1 && i <= uniqueColture.length)
      .map((i) => uniqueColture[i - 1].toLowerCase());

    const result = dosaggi.filter((d) => matchedColture.includes(d.coltura.toLowerCase()));
    console.log(
      `[FIND-DOSAGE] Match for ${cropName}: ${result.length} dosaggi (${matchedColture.join(', ')}) [cache: ${cacheResult.fromCache}]. Reason: ${matchResult.reason}`,
    );

    // In-memory cache for same-session reuse
    setCachedPlannerValue(dosageDetailsCache, cacheKey, result);

    return result;
  } catch (err) {
    console.error(`[FIND-DOSAGE] LLM failed for ${cropName}:`, err);
    return [];
  }
}

/**
 * Main: Plan treatments for a product on a production unit
 * cycle must be pre-built via buildCompleteCycle (called once per unit)
 */
export async function planProductTreatments(
  label: Label,
  cycle: CompleteCycle,
  planningWindow?: PlanningWindow,
  context?: DosageAgentContext,
  strategyHint?: TreatmentStrategyHint,
  agronomicContext?: { agronomicNotes?: string; priorityTargets?: string[] },
): Promise<{
  dateRange: DateRangeResult | null;
  schedule: TreatmentScheduleResult | null;
}> {
  const productName = label.prodotto || 'unknown';

  const rawDateRange = await determineDateRange(label, cycle, context);
  const dateRange = planningWindow ? planningWindow.clampDateRange(rawDateRange) : rawDateRange;
  if (!dateRange) {
    console.warn(`[PLAN-TREATMENTS] ${productName}: dateRange is null`);
    return { dateRange: null, schedule: null };
  }
  console.log(
    `[PLAN-TREATMENTS] ${productName}: dateRange = ${dateRange.startDate} - ${dateRange.endDate}`,
  );

  const rawDosageDetails = await findDosageDetails(label, cycle.cropName, context, true);

  // Enrich dosage details from BDF API when critical fields are missing,
  // OR fetch dosage details entirely from BDF when label matching fails
  const dosageDetails = await enrichDosageDetailsFromBdf(
    rawDosageDetails,
    label.numero_registrazione || '',
    productName,
    cycle.cropName,
  );

  if (dosageDetails.length === 0) {
    console.warn(
      `[PLAN-TREATMENTS] ${productName}: no dosageDetails for ${cycle.cropName} (neither label nor BDF)`,
    );
    return { dateRange, schedule: { applications: [] } };
  }
  console.log(
    `[PLAN-TREATMENTS] ${productName}: found ${dosageDetails.length} dosageDetails${rawDosageDetails.length === 0 ? ' (from BDF)' : ' (BDF-enriched)'}`,
  );

  const schedule = await planApplications(
    dateRange,
    dosageDetails,
    cycle,
    label.malattie,
    label,
    context,
    strategyHint,
    agronomicContext,
  );
  const filteredSchedule = planningWindow ? planningWindow.filterSchedule(schedule) : schedule;
  console.log(
    `[PLAN-TREATMENTS] ${productName}: ${filteredSchedule?.applications.length ?? 0} applications planned`,
  );
  const scheduleResult: TreatmentScheduleResult | null = filteredSchedule
    ? { applications: [...filteredSchedule.applications] }
    : null;
  return { dateRange, schedule: scheduleResult };
}

/**
 * Plan applications using BBCH-derived date range
 * This function creates applications within a precise BBCH-based window
 */
async function planApplicationsWithBbchDates(
  bbchDateRange: BbchDateRange,
  dosageDetails: ReadonlyArray<LabelDoseDetail>,
  cycle: CompleteCycle,
  label?: Label,
  context?: DosageAgentContext,
): Promise<TreatmentScheduleResult> {
  const tracker = usageLogger.createTracker();

  // Aggregate constraints from dosageDetails
  const bbchMaxAppsWithValues = dosageDetails
    .map((d) => d.n_max_applicazioni)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const maxApps = bbchMaxAppsWithValues.length > 0 ? Math.max(...bbchMaxAppsWithValues) : null;
  const intervalsMin = dosageDetails
    .map((d) => d.intervallo_min_giorni)
    .filter((v): v is number => v != null);
  const intervalMin = intervalsMin.length > 0 ? Math.max(...intervalsMin) : 7;

  // BbchDateRange has string dates (YYYY-MM-DD format)
  const startDateStr = bbchDateRange.startDate;
  const endDateStr = bbchDateRange.endDate;

  const prompt = `Sei un agronomo esperto. Pianifica le applicazioni di un prodotto fitosanitario all'interno della finestra fenologica BBCH calcolata.

PRODOTTO: ${label?.prodotto || 'Prodotto fitosanitario'}
CATEGORIA: ${label?.categoria || 'Non specificata'}
COLTURA: ${cycle.cropName} ${cycle.variety || ''}

FINESTRA APPLICAZIONE (CALCOLATA DA SCALA BBCH):
- Data inizio: ${startDateStr}
- Data fine: ${endDateStr}
- Codici BBCH: ${bbchDateRange.bbchStart} - ${bbchDateRange.bbchEnd}
- Motivazione: ${bbchDateRange.reasoning}

CICLO FENOLOGICO COMPLETO:
- Semina/Inizio ciclo: ${cycle.startDate.toISOString().split('T')[0]}
- Fioritura: ${cycle.floweringDate.toISOString().split('T')[0]}
- Raccolta: ${cycle.harvestingDate.toISOString().split('T')[0]}
- Fine ciclo: ${cycle.endDate.toISOString().split('T')[0]}

VINCOLI ETICHETTA:
- Max applicazioni: ${maxApps !== null ? maxApps : 'Non specificato - usa giudizio agronomico'}
- Intervallo minimo tra applicazioni: ${intervalMin} giorni

REGOLE:
1. Le date DEVONO ricadere ESCLUSIVAMENTE tra ${startDateStr} e ${endDateStr}
2. ${maxApps !== null ? `Rispetta il numero massimo di applicazioni (${maxApps})` : 'Il numero massimo applicazioni NON è noto. Pianifica il numero agronomicamente appropriato per questa coltura e avversità.'}
3. Rispetta l'intervallo minimo di ${intervalMin} giorni tra applicazioni
4. Distribuisci le applicazioni uniformemente nella finestra se possibile
5. Allinea le date al lunedì più vicino (granularità settimanale)

Rispondi SOLO JSON:
{"applications":[{"date":"YYYY-MM-DD","epoch":"fase fenologica BBCH","isLocalized":false,"notes":"BBCH ${bbchDateRange.bbchStart}-${bbchDateRange.bbchEnd}: [descrizione]"}]}`;

  try {
    const { result, usedModel } = await callWithFallback<TreatmentScheduleResult>({
      operation: 'treatment-planning',
      context,
      modelOptions: { temperature: 0 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
        const content = extractResponseText(response.content);
        const jsonString = extractJsonFromResponse(content);
        const json = JSON.parse(jsonString);
        return TreatmentScheduleSchema.parse(json);
      },
    });
    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: {
        step: 'plan-applications-bbch',
        cropName: cycle.cropName,
        bbchStart: bbchDateRange.bbchStart,
        bbchEnd: bbchDateRange.bbchEnd,
      },
    });
    return result;
  } catch (err) {
    console.error('[PLAN-APPS-BBCH] LLM failed:', err);
    return { applications: [] };
  }
}
