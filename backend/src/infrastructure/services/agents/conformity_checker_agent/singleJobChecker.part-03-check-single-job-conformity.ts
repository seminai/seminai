import type { ConformityViolation } from './types';
import { SingleJobCheckInput, SingleJobCheckResult, checkCropIsAuthorized, checkDdtConformity, checkMaxApplicationsLimit } from './singleJobChecker.part-01-single-job-check-result';
import { applyUserNotesRules, checkDoseRange } from './singleJobChecker.part-02-check-dose-range';

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
