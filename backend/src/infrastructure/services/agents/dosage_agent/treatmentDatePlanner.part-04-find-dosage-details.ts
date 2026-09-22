import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { DosageAgentContext } from './context';
import { LlmCacheService } from './llmCacheService';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';
import { PlanningWindow } from './planningWindow';
import type { TreatmentStrategyHint } from './treatmentStrategyPlanner';
import { enrichDosageDetailsFromBdf } from './bdfDosageEnricher';
import { CompleteCycle, DOSAGE_DETAILS_PROMPT_VERSION, dosageDetailsCache, getCachedPlannerValue, llmCacheService, setCachedPlannerValue, usageLogger } from './treatmentDatePlanner.part-01-usage-logger';
import { DateRangeResult, TreatmentScheduleResult, determineDateRange } from './treatmentDatePlanner.part-02-build-complete-cycle';
import { planApplications } from './treatmentDatePlanner.part-03-plan-applications';

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
