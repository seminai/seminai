import { z } from 'zod';
import { LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { CompleteCycle } from './treatmentDatePlanner';
import { DosageAgentContext } from './context';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { LlmCacheService } from './llmCacheService';
import { callWithFallback, extractResponseText } from './llmProvider';

const usageLogger = LlmUsageLogger.getInstance();
const llmCacheService = new LlmCacheService(prisma, 5);
const BBCH_PROMPT_VERSION = 'bbch-mapper-v2';

/**
 * Extracts and cleans JSON from LLM response.
 * Handles common issues like:
 * - Markdown code blocks
 * - Text before/after JSON
 * - Trailing commas
 * - Unquoted keys (rare but possible)
 * - Nested braces (counts braces to find correct closing)
 */
function extractJsonFromLlmResponse(content: string): string {
  // Remove markdown code blocks
  let cleaned = content.replace(/```json\n?|\n?```/g, '').trim();

  // Find the first { to start JSON extraction
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) {
    console.error('[BBCH] Could not find opening brace in response:', content.substring(0, 200));
    throw new Error(`Invalid LLM response: no JSON object found`);
  }

  // Count braces to find the correct closing brace (handles nested objects)
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

  if (lastBrace === -1 || braceCount !== 0) {
    console.error(
      '[BBCH] Unclosed JSON object in response. Brace count:',
      braceCount,
      'Response preview:',
      content.substring(0, 500),
    );
    throw new Error(`Invalid LLM response: unclosed JSON object`);
  }

  cleaned = cleaned.substring(firstBrace, lastBrace + 1);

  // Fix trailing commas before closing braces (common LLM mistake)
  cleaned = cleaned.replace(/,\s*}/g, '}');
  cleaned = cleaned.replace(/,\s*]/g, ']');

  // Fix leading zeros in numbers (e.g., 00, 01, 09 -> 0, 1, 9)
  // JSON doesn't allow leading zeros in numbers
  cleaned = cleaned.replace(/:\s*0+(\d+)/g, ': $1');
  // Handle the special case of just "00" which should become "0"
  cleaned = cleaned.replace(/:\s*00(?=[,}\s])/g, ': 0');

  return cleaned;
}

/**
 * Output schema for BBCH-based date calculation
 */
const BbchDateRangeSchema = z.object({
  startDate: z.string().describe('Data inizio finestra applicazione YYYY-MM-DD'),
  endDate: z.string().describe('Data fine finestra applicazione YYYY-MM-DD'),
  bbchStart: z.number().min(0).max(99).describe('Codice BBCH inizio'),
  bbchEnd: z.number().min(0).max(99).describe('Codice BBCH fine'),
  reasoning: z.string().describe('Spiegazione del calcolo'),
});

export type BbchDateRange = z.infer<typeof BbchDateRangeSchema>;

/**
 * Build the prompt for BBCH date mapping
 */
function buildPrompt(
  epocaImpiego: string,
  cropName: string,
  year: number,
  baseCycle?: Partial<CompleteCycle>,
): string {
  return `Sei un agronomo esperto. Usa la scala fenologica BBCH e la tua conoscenza agronomica.

COMPITO: Calcola le DATE CONCRETE per applicare un prodotto fitosanitario.

INPUT:
- Epoca impiego (da etichetta): "${epocaImpiego}"
- Coltura: ${cropName}
- Anno riferimento: ${year}
${baseCycle?.startDate ? `- Data semina/impianto: ${baseCycle.startDate.toISOString().split('T')[0]}` : ''}
${baseCycle?.floweringDate ? `- Data fioritura: ${baseCycle.floweringDate.toISOString().split('T')[0]}` : ''}
${baseCycle?.harvestingDate ? `- Data raccolta: ${baseCycle.harvestingDate.toISOString().split('T')[0]}` : ''}

ISTRUZIONI:
1. Identifica il tipo di coltura e il suo ciclo fenologico tipico
2. Traduci l'epoca impiego in codici BBCH (scala universale 00-99)
3. Calcola le date concrete in cui la coltura raggiunge quella fase fenologica
4. Considera il clima italiano e le pratiche agronomiche standard

Rispondi SOLO in JSON:
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "bbchStart": numero,
  "bbchEnd": numero,
  "reasoning": "breve spiegazione del calcolo"
}`;
}

/**
 * Convert label epoca_impiego to application date range using BBCH scale.
 * Works for any crop type (annual, perennial, cereals, fruit trees, vegetables, etc.)
 * The LLM uses its agronomic knowledge to determine correct dates.
 *
 * Results are cached per userId to avoid redundant LLM calls for the same epoca/crop combination.
 *
 * @param dosageDetail - The dosage detail from label containing epoca_impiego
 * @param cropName - The crop name (e.g., "orzo", "vite", "melo")
 * @param baseCycle - Optional base cycle with known dates (startDate, floweringDate, harvestingDate)
 * @param context - Optional dosage agent context for logging and cache isolation per user
 * @returns Date range for application window with BBCH codes, or null if mapping fails
 */
export async function mapEpocaToApplicationDates(
  dosageDetail: LabelDoseDetail,
  cropName: string,
  baseCycle?: Partial<CompleteCycle>,
  context?: DosageAgentContext,
): Promise<BbchDateRange | null> {
  const epocaImpiego = dosageDetail.epoca_impiego;
  if (!epocaImpiego?.trim()) return null;

  const year = new Date().getFullYear();
  const prompt = buildPrompt(epocaImpiego, cropName, year, baseCycle);

  // Cache key includes userId for isolation per user
  const cacheKey = `bbch:${LlmCacheService.createStableHash({
    userId: context?.userId || 'anonymous',
    epoca: epocaImpiego.toLowerCase().trim(),
    crop: cropName.toLowerCase().trim(),
    year,
    promptVersion: BBCH_PROMPT_VERSION,
  })}`;

  try {
    const result = await llmCacheService.getOrRefresh<BbchDateRange>({
      namespace: 'bbch-date-mapping',
      cacheKey,
      model: 'bbch-mapping',
      promptVersion: BBCH_PROMPT_VERSION,
      userId: context?.userId,
      computeScore: (payload) => {
        // Score based on completeness: valid dates and BBCH codes
        let score = 0;
        if (payload.startDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)) score += 3;
        if (payload.endDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.endDate)) score += 3;
        if (payload.bbchStart >= 0 && payload.bbchStart <= 99) score += 2;
        if (payload.bbchEnd >= payload.bbchStart && payload.bbchEnd <= 99) score += 2;
        return score;
      },
      fetchFresh: async () => {
        const tracker = usageLogger.createTracker();
        const { result: bbchResult, usedModel } = await callWithFallback<BbchDateRange>({
          operation: 'bbch-mapping',
          context,
          modelOptions: { temperature: 0 },
          execute: async (llm) => {
            const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
            const content = extractResponseText(response.content);
            try {
              const cleanedContent = extractJsonFromLlmResponse(content);
              const json = JSON.parse(cleanedContent);
              return BbchDateRangeSchema.parse(json);
            } catch (parseError) {
              console.error('[BBCH] JSON parsing failed. Raw response:', content.substring(0, 500));
              console.error(
                '[BBCH] Parse error:',
                parseError instanceof Error ? parseError.message : String(parseError),
              );
              throw parseError;
            }
          },
        });
        await usageLogger.logFromAccumulator(tracker.accumulator, {
          userId: context?.userId,
          companyId: context?.companyId,
          jobId: context?.jobId,
          jobGroupId: context?.jobGroupId,
          jobType: context?.jobType ?? LlmJobType.DOSAGE,
          model: usedModel,
          metadata: { step: 'bbch-date-mapping' },
        });
        return bbchResult;
      },
    });

    console.log(
      `[BBCH] "${epocaImpiego}" on ${cropName} → ${result.payload.startDate} to ${result.payload.endDate} (BBCH ${result.payload.bbchStart}-${result.payload.bbchEnd}) [cache: ${result.fromCache}]`,
    );

    return result.payload;
  } catch (err) {
    console.error(`[BBCH] Failed for "${epocaImpiego}" on ${cropName}:`, err);
    return null;
  }
}
