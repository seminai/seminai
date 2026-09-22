import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { planProductTreatments, findDosageDetails, type CompleteCycle } from './treatmentDatePlanner';
import { PlanningWindow } from './planningWindow';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext } from './context';
import { type TreatmentStrategyHint } from './treatmentStrategyPlanner';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { applyNMaxApplicationsLimit } from './checkNMaxApplication';
import { checkDdtDateConformityBatch, type DdtDateCheckResult } from './ddtDateChecker';
import { AllowedProductBase, TreatmentApplication, UnitAllowedProductWithDosage, extractLabel, getDosageUm, parseAndFixDate } from './flowMatchProductionUnitTreatmentDosage.part-01-llm-concurrency-limit';

export async function processProduct(
  product: AllowedProductBase,
  unit: UnitAllowedProductsOutput,
  completeCycle: CompleteCycle,
  planningWindow?: PlanningWindow,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
  strategyHint?: TreatmentStrategyHint,
  agronomicContext?: { agronomicNotes?: string; priorityTargets?: string[] },
): Promise<UnitAllowedProductWithDosage> {
  const label = extractLabel(product);
  const name = String((product as { name?: string }).name || '');
  const regNumber = String((product as { regNumber?: string }).regNumber || '');
  const productKey = `${name}|${regNumber}`;

  if (!label) {
    const reason = `Etichetta non disponibile per ${name}: impossibile calcolare dosaggi e trattamenti senza i dati di etichetta`;
    console.warn(`[DOSAGE-V2] No label for ${name}. Skip.`);
    if (historyManager) {
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Dosaggio: Label non disponibile',
        reason,
        DosageAgentStep.DOSAGE_SCHEDULING,
        DataSource.LABEL_EXTRACTION,
        {
          productionUnitId: unit.unitProductionId,
          cropName: completeCycle.cropName,
          productName: name,
          productRegistrationNumber: regNumber,
          description: reason,
        },
      );
    }
    return { ...product, trattamenti: undefined, noTreatmentReason: reason };
  }

  console.log(`[DOSAGE-V2] Processing product: ${name} for crop: ${completeCycle.cropName}`);
  const { dateRange, schedule } = await planProductTreatments(
    label,
    completeCycle,
    planningWindow,
    context,
    strategyHint,
    agronomicContext,
  );

  if (historyManager && dateRange) {
    historyManager.addEntry(
      unit.unitProductionId,
      productKey,
      'Date range determinato',
      `${dateRange.startDate} - ${dateRange.endDate}. ${dateRange.reason}`,
      DosageAgentStep.CROP_MATCHING,
      DataSource.LLM_OPENAI,
      {
        productionUnitId: unit.unitProductionId,
        cropName: completeCycle.cropName,
        productName: name,
      },
    );
  }

  if (!schedule || schedule.applications.length === 0) {
    const dateInfo = dateRange
      ? `nel periodo ${dateRange.startDate} - ${dateRange.endDate}`
      : 'perché non è stato possibile determinare un periodo di applicazione valido';
    const reason =
      `Nessuna applicazione pianificata per ${name} su ${completeCycle.cropName} ${dateInfo}. ${dateRange?.reason || ''}`.trim();
    console.warn(`[DOSAGE-V2] ${name}: no applications scheduled`);
    if (historyManager) {
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Dosaggio: Nessun trattamento pianificato',
        reason,
        DosageAgentStep.DOSAGE_SCHEDULING,
        DataSource.LLM_OPENAI,
        {
          productionUnitId: unit.unitProductionId,
          cropName: completeCycle.cropName,
          productName: name,
          productRegistrationNumber: regNumber,
          description: reason,
        },
      );
    }
    return { ...product, trattamenti: undefined, noTreatmentReason: reason };
  }

  const dosageUm = await getDosageUm(label, completeCycle.cropName);
  const dosageDetails = await findDosageDetails(label, completeCycle.cropName, undefined, true);

  // Enforce label max applications if present (hard clamp only when exceeded)
  const nMaxResult = applyNMaxApplicationsLimit({
    applications: schedule.applications,
    dosageDetails,
  });
  const effectiveApplications = nMaxResult.applications;
  if (nMaxResult.wasLimited) {
    console.warn(
      `[DOSAGE-V2] ${name}: applications trimmed to n_max_applicazioni=${nMaxResult.maxApplications} (${schedule.applications.length} -> ${effectiveApplications.length})`,
    );
    if (historyManager) {
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Applicazioni limitate da etichetta (n_max_applicazioni)',
        `${schedule.applications.length} -> ${effectiveApplications.length} (max=${nMaxResult.maxApplications})`,
        DosageAgentStep.DOSAGE_SCHEDULING,
        DataSource.AUTOMATIC_CALCULATION,
        {
          productionUnitId: unit.unitProductionId,
          cropName: completeCycle.cropName,
          productName: name,
          productRegistrationNumber: regNumber,
          description:
            'Applicazioni generate dal planner ridotte per rispettare il numero massimo di applicazioni indicato in etichetta.',
        },
      );
    }
  }

  // Prendi le fasce di rispetto direttamente dall'etichetta (già estratte durante label extraction)
  const fasceRispettoAcqua = label.fasce_rispetto_acqua?.trim() || null;
  const fasceRispettoColture = label.fasce_rispetto_colture?.trim() || null;

  const baseTreatments = effectiveApplications.map((app) => {
    // Trova il dosageDetail corrispondente basandosi sull'epoch (epoca_impiego)
    const matchingDetail = dosageDetails.find((detail) => {
      const detailEpoca = detail.epoca_impiego?.toLowerCase().trim() || '';
      const appEpoch = app.epoch?.toLowerCase().trim() || '';
      // Match esatto o parziale (l'epoch può essere più specifico dell'epoca_impiego)
      return (
        detailEpoca === appEpoch || appEpoch.includes(detailEpoca) || detailEpoca.includes(appEpoch)
      );
    });

    // Prendi le istruzioni dal dosageDetail corrispondente, o null se non presente
    const application = matchingDetail?.istruzioni?.trim() || null;

    return {
      data_distribuzione: parseAndFixDate(app.date, completeCycle.startDate, completeCycle.endDate),
      dose: undefined,
      epoca_impiego: app.epoch,
      isLocalizedTreatment: app.isLocalized,
      note: app.notes,
      dosaggio_um: dosageUm,
      application,
      fasce_rispetto_acqua: fasceRispettoAcqua,
      fasce_rispetto_colture: fasceRispettoColture,
    };
  });

  // Controllo conformità date DDT - check finale sui trattamenti creati
  let ddtCheckResults: DdtDateCheckResult[] = [];
  try {
    // Cerca il prodotto per nome (più affidabile di registrationNumber che spesso è null nel DB)
    ddtCheckResults = await checkDdtDateConformityBatch(baseTreatments, regNumber, undefined, name);
    console.log(
      `[DOSAGE-V2] ${name}: DDT date check completed for ${ddtCheckResults.length} treatments`,
    );
  } catch (error) {
    console.warn(`[DOSAGE-V2] ${name}: DDT date check failed`, error);
    // In caso di errore, tutti i risultati saranno null
    ddtCheckResults = baseTreatments.map(() => ({
      ddt_date_is_ok: null,
      ddt_date_conformity: null,
      ddt_date_after_treatment: null,
    }));
  }

  // Combina i trattamenti con i risultati del controllo DDT
  const trattamenti: TreatmentApplication[] = baseTreatments.map((treatment, index) => ({
    ...treatment,
    ddt_date_is_ok: ddtCheckResults[index]?.ddt_date_is_ok ?? null,
    ddt_date_conformity: ddtCheckResults[index]?.ddt_date_conformity ?? null,
    ddt_date_after_treatment: ddtCheckResults[index]?.ddt_date_after_treatment ?? null,
  }));

  if (historyManager) {
    historyManager.addEntry(
      unit.unitProductionId,
      productKey,
      'Trattamenti pianificati',
      `${trattamenti.length} applicazioni`,
      DosageAgentStep.DOSAGE_SCHEDULING,
      DataSource.LLM_OPENAI,
      {
        productionUnitId: unit.unitProductionId,
        cropName: completeCycle.cropName,
        productName: name,
      },
    );
  }

  console.log(
    `[DOSAGE-V2] ${name}: ${trattamenti.length} treatments for ${completeCycle.cropName}`,
  );
  return { ...product, trattamenti };
}
