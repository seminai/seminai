import { CompleteCycle } from './treatmentDatePlanner';
import { LabelDoseDetail, Label } from '../../../../domain/dtos/label.dto';
import { DosageAgentContext } from './context';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';
import { InferredTiming, PlannedApplications, PlannedApplicationsSchema, inferApplicationTiming, usageLogger } from './applicationTimingInferrer.part-01-usage-logger';

/**
 * Plan specific application dates based on inferred timing and crop cycle.
 * This function takes the inferred timing and the actual crop cycle to produce
 * concrete dates for each application.
 */
export async function planApplicationsFromInferredTiming(
  inferredTiming: InferredTiming,
  cycle: CompleteCycle,
  dosageDetail: LabelDoseDetail,
  productName: string,
  context?: DosageAgentContext,
): Promise<PlannedApplications> {
  const maxApps = dosageDetail.n_max_applicazioni ?? 5;
  const intervalMin = dosageDetail.intervallo_min_giorni ?? 7;
  const safetyDays = dosageDetail.intervallo_sicurezza_giorni ?? 3;

  const phasesText = inferredTiming.recommendedPhases
    .sort((a, b) => b.priority - a.priority)
    .map((p, i) => `${i + 1}. ${p.phase} (priorità ${p.priority}/10): ${p.reason}`)
    .join('\n');

  const prompt = `Sei un agronomo esperto. Devi pianificare DATE CONCRETE per applicare un ${inferredTiming.productType}.

PRODOTTO: ${productName}
COLTURA: ${cycle.cropName} ${cycle.variety || ''}
TIPO PRODOTTO: ${inferredTiming.productType}
MALATTIE TARGET: ${inferredTiming.targetDiseases.join(', ')}
STRATEGIA RACCOMANDATA: ${inferredTiming.applicationStrategy}

CICLO FENOLOGICO DELLA COLTURA:
- Inizio ciclo/Ripresa vegetativa: ${cycle.startDate.toISOString().split('T')[0]}
- Fioritura: ${cycle.floweringDate.toISOString().split('T')[0]}
- Raccolta: ${cycle.harvestingDate.toISOString().split('T')[0]}
- Fine ciclo: ${cycle.endDate.toISOString().split('T')[0]}

RIFERIMENTI TEMPORALI PER COLTURE ARBOREE (usa come guida per calcolare le date):
- Riposo vegetativo: dicembre-febbraio (prima dell'inizio ciclo)
- Pre-fioritura: 7-21 giorni prima della fioritura
- Allegagione: 7-14 giorni dopo fine fioritura
- Ingrossamento frutti: da allegagione fino a 30-45 giorni prima raccolta
- Invaiatura: 20-40 giorni prima raccolta (varia per coltura)
- Pre-raccolta: rispetta sempre il PHI (intervallo sicurezza)

FASI RACCOMANDATE PER L'APPLICAZIONE (in ordine di priorità):
${phasesText}

VINCOLI DA ETICHETTA:
- Max applicazioni: ${maxApps}
- Intervallo minimo tra applicazioni: ${intervalMin} giorni
- Intervallo di sicurezza pre-raccolta (PHI): ${safetyDays} giorni

ISTRUZIONI:
1. Distribuisci le applicazioni nelle fasi raccomandate, rispettando il numero massimo
2. Calcola le date concrete basandoti sul ciclo fenologico fornito
3. Rispetta SEMPRE l'intervallo minimo tra applicazioni
4. L'ultima applicazione deve essere ALMENO ${safetyDays} giorni prima della raccolta
5. Privilegia le fasi con priorità più alta
6. Se le fasi raccomandate sono più del numero max di applicazioni, scegli le più critiche

Rispondi SOLO in JSON:
{
  "applications": [
    {
      "date": "YYYY-MM-DD",
      "phase": "nome fase fenologica",
      "targetDiseases": ["malattia1", "malattia2"],
      "notes": "Fase fenologica: [fase]. Trattamento per: [malattie]. [altre note]",
      "isLocalized": false
    }
  ],
  "totalApplications": numero,
  "reasoning": "breve spiegazione delle scelte fatte"
}`;

  try {
    const tracker = usageLogger.createTracker();
    const { result, usedModel } = await callWithFallback<PlannedApplications>({
      operation: 'timing-inference',
      context,
      modelOptions: { temperature: 0 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
        const content = extractResponseText(response.content);
        const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const json = JSON.parse(cleanedContent);
        return PlannedApplicationsSchema.parse(json);
      },
    });
    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: { step: 'timing-inference-planning' },
    });

    console.log(
      `[TIMING-INFERRER] ${productName}: ${result.totalApplications} applicazioni pianificate. ${result.reasoning}`,
    );

    return result;
  } catch (err) {
    console.error(`[TIMING-INFERRER] Planning failed for ${productName}:`, err);
    return {
      applications: [],
      totalApplications: 0,
      reasoning: 'Errore nella pianificazione',
    };
  }
}

/**
 * Check if a dosage detail needs timing inference (epoca_impiego is null or empty)
 */
export function needsTimingInference(dosageDetail: LabelDoseDetail): boolean {
  const epoca = dosageDetail.epoca_impiego;
  return !epoca || epoca.trim() === '' || epoca.toLowerCase() === 'non specificata';
}

/**
 * Full inference pipeline: infer timing and plan applications
 */
export async function inferAndPlanApplications(
  label: Label,
  dosageDetail: LabelDoseDetail,
  cycle: CompleteCycle,
  context?: DosageAgentContext,
): Promise<PlannedApplications> {
  const productName = label.prodotto || 'Prodotto';
  const cropName = cycle.cropName;

  console.log(
    `[TIMING-INFERRER] Inferring timing for ${productName} on ${cropName} (epoca_impiego not specified)`,
  );

  // Step 1: Infer application timing based on product type and diseases
  const inferredTiming = await inferApplicationTiming(label, dosageDetail, cropName, context);

  if (!inferredTiming) {
    console.warn(`[TIMING-INFERRER] Could not infer timing for ${productName}`);
    return {
      applications: [],
      totalApplications: 0,
      reasoning: 'Impossibile inferire il timing di applicazione',
    };
  }

  // Step 2: Plan concrete application dates
  const plannedApplications = await planApplicationsFromInferredTiming(
    inferredTiming,
    cycle,
    dosageDetail,
    productName,
    context,
  );

  return plannedApplications;
}
