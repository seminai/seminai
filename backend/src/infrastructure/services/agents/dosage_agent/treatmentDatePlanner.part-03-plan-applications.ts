import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { DosageAgentContext } from './context';
import type { TreatmentStrategyHint } from './treatmentStrategyPlanner';
import { needsTimingInference, inferAndPlanApplications } from './applicationTimingInferrer';
import { mapEpocaToApplicationDates } from './bbchPhenologyMapper';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';
import { DateRangeResult, TreatmentScheduleResult, TreatmentScheduleSchema } from './treatmentDatePlanner.part-02-build-complete-cycle';
import { CompleteCycle, extractJsonFromResponse, usageLogger } from './treatmentDatePlanner.part-01-usage-logger';
import { planApplicationsWithBbchDates } from './treatmentDatePlanner.part-05-plan-applications-with-bbch-dates';

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
