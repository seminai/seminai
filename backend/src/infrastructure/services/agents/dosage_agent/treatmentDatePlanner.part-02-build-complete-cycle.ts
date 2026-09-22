import { DosageAgentContext } from './context';
import { z } from 'zod';
import { Label } from '../../../../domain/dtos/label.dto';
import { LlmCacheService } from './llmCacheService';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';
import { CompleteCycle, DATE_RANGE_PROMPT_VERSION, PHENOLOGY_PROMPT_VERSION, ProductionUnitCycle, completeCycleCache, getCachedPlannerValue, getPhenologicalDates, llmCacheService, setCachedPlannerValue, usageLogger } from './treatmentDatePlanner.part-01-usage-logger';

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
export const DateRangeSchema = z.object({
  startDate: z.string().describe('YYYY-MM-DD'),
  endDate: z.string().describe('YYYY-MM-DD'),
  isOutsideProduction: z.boolean(),
  reason: z.string(),
});

/**
 * Schema for LLM response - Step 2: Treatment Schedule
 */
export const TreatmentScheduleSchema = z.object({
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
