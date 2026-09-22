import type { ConformityViolation, JobWithRelations, JobOptimizationProposal } from './types';
import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { checkDdtDateConformity } from '../dosage_agent/ddtDateChecker';
import { applyNMaxApplicationsLimit } from '../dosage_agent/checkNMaxApplication';
import { checkCropAuthorizationWithLlmFallback } from './matchers';

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
export interface SingleJobCheckInput {
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
export async function checkDdtConformity(
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
export function checkMaxApplicationsLimit(
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
export async function checkCropIsAuthorized(
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
