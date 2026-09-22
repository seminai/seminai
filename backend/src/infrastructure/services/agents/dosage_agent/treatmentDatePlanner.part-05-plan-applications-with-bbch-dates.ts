import { BbchDateRange } from './bbchPhenologyMapper';
import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { DosageAgentContext } from './context';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';
import { CompleteCycle, extractJsonFromResponse, usageLogger } from './treatmentDatePlanner.part-01-usage-logger';
import { TreatmentScheduleResult, TreatmentScheduleSchema } from './treatmentDatePlanner.part-02-build-complete-cycle';

/**
 * Plan applications using BBCH-derived date range
 * This function creates applications within a precise BBCH-based window
 */
export async function planApplicationsWithBbchDates(
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
