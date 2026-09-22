import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import type { ConformityViolation, JobWithRelations, JobOptimizationProposal } from './types';
import { checkDdtDateConformity } from '../dosage_agent/ddtDateChecker';
import { applyNMaxApplicationsLimit } from '../dosage_agent/checkNMaxApplication';
import { findMatchingDoseDetail, checkCropAuthorizationWithLlmFallback } from './matchers';

/**
 * Result of single job conformity check
 */
export interface SingleJobCheckResult {
  readonly violations: ConformityViolation[];
  readonly proposedValues: JobOptimizationProposal['proposedValues'];
  readonly shouldExclude: boolean;
  readonly exclusionReason?: string;
}

/**
 * Input parameters for single job check
 */
interface SingleJobCheckInput {
  readonly job: JobWithRelations;
  readonly label: Label | null;
  readonly allJobsForProduct: JobWithRelations[];
  readonly userNotesRules: string[];
  /** If set, the product has been revoked by the ministry */
  readonly revokedViolation?: ConformityViolation;
}

/**
 * Checks DDT date conformity and returns violations if any
 */
async function checkDdtConformity(
  job: JobWithRelations,
  registrationNumber: string,
  productId: string | undefined,
  productName: string,
): Promise<ConformityViolation[]> {
  const violations: ConformityViolation[] = [];

  const ddtResult = await checkDdtDateConformity(
    job.dateOfOpeation,
    registrationNumber,
    productId,
    productName,
  );

  if (ddtResult.ddt_date_is_ok === false) {
    violations.push({
      type: 'DDT_DATE_INVALID',
      message: ddtResult.ddt_date_conformity ?? 'Data DDT non conforme',
      severity: 'ERROR',
      source: 'SYSTEM',
      field: 'ddt_date',
    });
  }

  return violations;
}

/**
 * Checks max applications limit and returns violations if exceeded
 */
function checkMaxApplicationsLimit(
  job: JobWithRelations,
  label: Label,
  allJobsForProduct: JobWithRelations[],
): { violations: ConformityViolation[]; shouldExclude: boolean; exclusionReason?: string } {
  const violations: ConformityViolation[] = [];
  let shouldExclude = false;
  let exclusionReason: string | undefined;

  if (!label.dosaggi_dettagliati) {
    return { violations, shouldExclude, exclusionReason };
  }

  const { wasLimited, maxApplications } = applyNMaxApplicationsLimit({
    applications: allJobsForProduct,
    dosageDetails: label.dosaggi_dettagliati as LabelDoseDetail[],
  });

  if (wasLimited && maxApplications !== null) {
    const jobIndex = allJobsForProduct.findIndex((j) => j.id === job.id);
    if (jobIndex >= maxApplications) {
      violations.push({
        type: 'N_MAX_APPLICATIONS_EXCEEDED',
        message: `Applicazione n.${jobIndex + 1} supera il limite massimo di ${maxApplications} applicazioni consentite`,
        severity: 'ERROR',
        source: 'LABEL',
        field: 'n_applications',
        currentValue: jobIndex + 1,
        expectedValue: maxApplications,
      });
      shouldExclude = true;
      exclusionReason = `Superato limite max applicazioni (${maxApplications})`;
    }
  }

  return { violations, shouldExclude, exclusionReason };
}

/**
 * Checks if the crop is authorized by the label (with LLM fallback)
 */
async function checkCropIsAuthorized(
  job: JobWithRelations,
  label: Label,
  productName: string,
): Promise<{
  violations: ConformityViolation[];
  shouldExclude: boolean;
  exclusionReason?: string;
  llmMatchedCrops?: ReadonlyArray<string>;
}> {
  const violations: ConformityViolation[] = [];
  let shouldExclude = false;
  let exclusionReason: string | undefined;

  const cropName = job.productionCycle?.cropName;
  const variety = job.productionCycle?.variety;

  const authResult = await checkCropAuthorizationWithLlmFallback(
    label,
    productName,
    cropName,
    variety,
  );

  if (!authResult.isAuthorized && authResult.authorizedCrops.length > 0) {
    const cropDisplay = cropName || variety || 'sconosciuta';
    const authorizedList = authResult.authorizedCrops.slice(0, 10).join(', ');
    const hasMore =
      authResult.authorizedCrops.length > 10
        ? ` e altre ${authResult.authorizedCrops.length - 10}`
        : '';

    let message = `La coltura "${cropDisplay}" non è autorizzata per questo prodotto. Colture autorizzate: ${authorizedList}${hasMore}.`;
    if (authResult.llmReason) {
      message += ` (LLM: ${authResult.llmReason})`;
    }

    violations.push({
      type: 'CROP_NOT_AUTHORIZED',
      message,
      severity: 'ERROR',
      source: 'LABEL',
      field: 'crop',
      currentValue: cropDisplay,
    });

    shouldExclude = true;
    exclusionReason = `Coltura "${cropDisplay}" non autorizzata`;
  } else if (authResult.matchedByLlm) {
    const cropDisplay = cropName || variety || 'N/A';
    violations.push({
      type: 'CROP_MATCHED_BY_LLM',
      message: `Coltura "${cropDisplay}" autorizzata tramite matching semantico LLM (confidence: ${authResult.llmConfidence}%). ${authResult.llmReason || ''}`,
      severity: 'INFO',
      source: 'LABEL',
      field: 'crop',
      currentValue: cropDisplay,
    });
  }

  return {
    violations,
    shouldExclude,
    exclusionReason,
    llmMatchedCrops: authResult.llmMatchedCrops,
  };
}

/**
 * Checks dose range from label and returns violations and proposed quantity
 */
function checkDoseRange(
  job: JobWithRelations,
  label: Label,
  dosePerHa: number,
  areaHa: number,
  llmMatchedCrops?: ReadonlyArray<string>,
): { violations: ConformityViolation[]; proposedQuantity: number; proposedNote: string } {
  const violations: ConformityViolation[] = [];
  let proposedQuantity = job.quantity;
  let proposedNote = '';

  const doseDetail = findMatchingDoseDetail(
    label,
    job.productionCycle?.cropName,
    job.productionCycle?.variety,
    llmMatchedCrops,
  );

  if (!doseDetail) {
    violations.push({
      type: 'DOSE_DETAIL_NOT_FOUND',
      message: `Nessun dettaglio dosaggio trovato in etichetta per la coltura "${job.productionCycle?.cropName ?? 'sconosciuta'}". Il controllo dose non è stato effettuato.`,
      severity: 'INFO',
      source: 'LABEL',
      field: 'dose',
    });
    return { violations, proposedQuantity, proposedNote };
  }

  if (doseDetail.dose_massima && dosePerHa > doseDetail.dose_massima) {
    violations.push({
      type: 'DISCIPLINARI_DOSE_EXCEEDED',
      message: `Dose ${dosePerHa.toFixed(2)} ${job.unitOfMeasureQuantity}/ha supera il massimo ${doseDetail.dose_massima} ${doseDetail.dose_um}`,
      severity: 'ERROR',
      source: 'LABEL',
      field: 'dose',
      currentValue: dosePerHa,
      expectedValue: doseDetail.dose_massima,
    });
    proposedQuantity = doseDetail.dose_massima * areaHa;
    proposedNote += ` [CONFORMITY] Dose ridotta da ${dosePerHa.toFixed(2)} a ${doseDetail.dose_massima} ${doseDetail.dose_um}/ha per rispettare il limite etichetta.`;
  }

  if (doseDetail.dose_minima && dosePerHa < doseDetail.dose_minima) {
    const minQuantityRequired = doseDetail.dose_minima * areaHa;
    violations.push({
      type: 'DISCIPLINARI_DOSE_BELOW_MIN',
      message: `Dose ${dosePerHa.toFixed(2)} ${job.unitOfMeasureQuantity}/ha sotto il minimo ${doseDetail.dose_minima} ${doseDetail.dose_um}. Quantità minima richiesta: ${minQuantityRequired.toFixed(2)} ${job.unitOfMeasureQuantity}`,
      severity: 'WARNING',
      source: 'LABEL',
      field: 'dose',
      currentValue: dosePerHa,
      expectedValue: doseDetail.dose_minima,
    });
    proposedQuantity = minQuantityRequired;
    proposedNote += ` [CONFORMITY] Dose aumentata da ${dosePerHa.toFixed(2)} a ${doseDetail.dose_minima} ${doseDetail.dose_um}/ha per rispettare il limite minimo etichetta.`;
  }

  return { violations, proposedQuantity, proposedNote };
}

/**
 * Applies user notes rules and returns informational violations
 */
function applyUserNotesRules(userNotesRules: string[]): ConformityViolation[] {
  const violations: ConformityViolation[] = [];

  for (const rule of userNotesRules) {
    if (rule.toLowerCase().includes('evitare') || rule.toLowerCase().includes('non usare')) {
      violations.push({
        type: 'USER_NOTE_WARNING',
        message: `Regola utente: ${rule}`,
        severity: 'INFO',
        source: 'USER_NOTES',
      });
    }
  }

  return violations;
}

/**
 * Verifies conformity of a single job against label and rules
 */
export async function checkSingleJobConformity(
  input: SingleJobCheckInput,
): Promise<SingleJobCheckResult> {
  const { job, label, allJobsForProduct, userNotesRules, revokedViolation } = input;
  const violations: ConformityViolation[] = [];
  let shouldExclude = false;
  let exclusionReason: string | undefined;

  const productStock = job.stocks[0];
  const areaHa = job.productionUnit.areaHa;

  // Validate: job must have at least one stock with a product
  if (!productStock?.product) {
    violations.push({
      type: 'MISSING_STOCK_DATA',
      message: `L'intervento non ha un prodotto associato (stocks vuoti). Impossibile verificare conformità.`,
      severity: 'WARNING',
      source: 'SYSTEM',
      field: 'stocks',
    });
    return {
      violations,
      proposedValues: {
        quantity: job.quantity,
        unitOfMeasureQuantity: job.unitOfMeasureQuantity,
        dateOfOpeation: job.dateOfOpeation,
        treatedSurface: areaHa,
      },
      shouldExclude: false,
    };
  }

  // Validate: area must be positive for dose/ha calculations
  if (areaHa <= 0) {
    violations.push({
      type: 'INVALID_AREA',
      message: `Area dell'unità produttiva non valida (${areaHa} ha). Il calcolo dose/ha non è possibile.`,
      severity: 'WARNING',
      source: 'SYSTEM',
      field: 'area',
      currentValue: areaHa,
    });
  }

  const registrationNumber = productStock.product.registrationNumber ?? '';
  const productName = productStock.product.name ?? '';
  const dosePerHa = areaHa > 0 ? job.quantity / areaHa : 0;

  let proposedQuantity = job.quantity;
  let proposedNote = job.note ?? '';

  // 0. Check if product is revoked
  if (revokedViolation) {
    violations.push(revokedViolation);
    shouldExclude = true;
    exclusionReason = revokedViolation.message;
  }

  // 1. Check DDT date conformity
  const ddtViolations = await checkDdtConformity(
    job,
    registrationNumber,
    productStock?.product?.id,
    productName,
  );
  violations.push(...ddtViolations);

  // 2. Check N max applications
  if (label) {
    const maxAppResult = checkMaxApplicationsLimit(job, label, allJobsForProduct);
    violations.push(...maxAppResult.violations);
    if (maxAppResult.shouldExclude) {
      shouldExclude = true;
      exclusionReason = maxAppResult.exclusionReason;
    }
  }

  // 3. Check crop authorization via LLM
  let llmMatchedCrops: ReadonlyArray<string> | undefined;
  if (label) {
    const cropResult = await checkCropIsAuthorized(job, label, productName);
    violations.push(...cropResult.violations);
    llmMatchedCrops = cropResult.llmMatchedCrops;
    if (cropResult.shouldExclude && !shouldExclude) {
      shouldExclude = true;
      exclusionReason = cropResult.exclusionReason;
    }
  }

  // 4. Check dose range from label (only if crop is authorized)
  if (label && areaHa > 0 && !shouldExclude) {
    const doseResult = checkDoseRange(job, label, dosePerHa, areaHa, llmMatchedCrops);
    violations.push(...doseResult.violations);
    proposedQuantity = doseResult.proposedQuantity;
    proposedNote += doseResult.proposedNote;
  }

  // 5. Apply user notes rules
  const userNotesViolations = applyUserNotesRules(userNotesRules);
  violations.push(...userNotesViolations);

  return {
    violations,
    proposedValues: {
      quantity: shouldExclude ? 0 : proposedQuantity,
      unitOfMeasureQuantity: job.unitOfMeasureQuantity,
      dateOfOpeation: job.dateOfOpeation,
      treatedSurface: areaHa,
      note: proposedNote.trim() || undefined,
    },
    shouldExclude,
    exclusionReason,
  };
}
