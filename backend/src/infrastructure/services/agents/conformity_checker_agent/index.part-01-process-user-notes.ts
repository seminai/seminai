import { ConformityCheckerContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { ConformityCheckOutput, JobOptimizationProposal, ConformityViolation, JobWithRelations, LabelMap } from './types';
import { analyzeUserNotes } from './userNotesAnalyzer';
import { buildUnitDataForCompatibilityCheck, buildConformityNote } from './builders';
import { JobHistoryManager } from '../dosage_agent/historyCollector';
import { checkActiveIngredientCompatibility } from '../dosage_agent/activeIngredientCompatibilityChecker';
import { extractLabelFromExtraction, resolveLabel } from './matchers';
import { loadLabelForJob } from './loaders';
import { checkSingleJobConformity } from './singleJobChecker';

/**
 * Processes user notes and returns analysis result with rules and warnings
 */
export async function processUserNotes(
  notes: string | undefined,
  context: ConformityCheckerContext | undefined,
  logger: DosageLoggerService,
): Promise<{
  userNotesRules: string[];
  userNotesWarnings: ConformityViolation[];
  userNotesAnalysis?: ConformityCheckOutput['userNotesAnalysis'];
}> {
  if (!notes) {
    return { userNotesRules: [], userNotesWarnings: [] };
  }

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: 'Analisi note utente in corso...',
    });
  }

  const analysis = await analyzeUserNotes(notes);

  console.log(
    `[CONFORMITY-CHECKER] User notes analyzed: ${analysis.appliedRules.length} rules applied, ${analysis.ignoredRules.length} ignored`,
  );

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Note utente analizzate: ${analysis.appliedRules.length} regole applicate, ${analysis.ignoredRules.length} ignorate`,
      metadata: {
        appliedRules: analysis.appliedRules.length,
        ignoredRules: analysis.ignoredRules.length,
        warnings: analysis.warnings.length,
      },
    });
  }

  return {
    userNotesRules: analysis.appliedRules,
    userNotesWarnings: analysis.warnings,
    userNotesAnalysis: {
      originalNotes: notes,
      appliedRules: analysis.appliedRules,
      ignoredRules: analysis.ignoredRules,
    },
  };
}

/**
 * Checks active ingredient compatibility across all units
 */
export async function checkIngredientCompatibility(
  jobs: JobWithRelations[],
  labelByRegNumber: LabelMap,
  labelByProductName: LabelMap,
): Promise<Map<string, { isCompatible: boolean; reason: string | null }>> {
  const unitData = buildUnitDataForCompatibilityCheck(jobs, labelByRegNumber, labelByProductName);

  const historyManager = new JobHistoryManager();
  const compatibilityResults = new Map<string, { isCompatible: boolean; reason: string | null }>();

  for (const unit of unitData) {
    const checkResult = await checkActiveIngredientCompatibility(unit, historyManager);
    for (const productResult of checkResult.productResults) {
      if (!productResult.isCompatible) {
        const key = `${productResult.productName}|${productResult.regNumber}`;
        compatibilityResults.set(key, {
          isCompatible: false,
          reason: productResult.incompatibilityReason,
        });
      }
    }
  }

  return compatibilityResults;
}

/**
 * Groups jobs by production unit and product for N max applications check
 */
export function groupJobsByUnitAndProduct(jobs: JobWithRelations[]): Map<string, JobWithRelations[]> {
  const jobsByUnitAndProduct = new Map<string, JobWithRelations[]>();

  for (const job of jobs) {
    const regNumber = job.stocks[0]?.product?.registrationNumber ?? '';
    const productName = job.stocks[0]?.product?.name ?? '';
    const key = `${job.productionUnitId}|${regNumber || productName}`;
    if (!jobsByUnitAndProduct.has(key)) {
      jobsByUnitAndProduct.set(key, []);
    }
    jobsByUnitAndProduct.get(key)!.push(job);
  }

  return jobsByUnitAndProduct;
}

/**
 * Creates a proposal for a job based on conformity check results
 */
export async function createJobProposal(
  job: JobWithRelations,
  allJobsForProduct: JobWithRelations[],
  compatibilityResults: Map<string, { isCompatible: boolean; reason: string | null }>,
  userNotesRules: string[],
  userNotesWarnings: ConformityViolation[],
  labelByRegNumber?: LabelMap,
  labelByProductName?: LabelMap,
  revokedViolations?: Map<string, ConformityViolation>,
): Promise<JobOptimizationProposal> {
  const productStock = job.stocks[0];
  const regNumber = productStock?.product?.registrationNumber ?? '';
  const productName = productStock?.product?.name ?? '';

  // Use cached labels if available, otherwise load from DB
  let resolved: {
    label: import('../../../../domain/dtos/label.dto').Label | null;
    effectiveRegNumber: string;
  };
  if (labelByRegNumber && labelByProductName) {
    resolved = resolveLabel(regNumber, productName, labelByRegNumber, labelByProductName);
  } else {
    const labelExtraction = await loadLabelForJob({
      registrationNumber: regNumber,
      productName,
    });
    resolved = {
      label: extractLabelFromExtraction(labelExtraction),
      effectiveRegNumber: regNumber || (labelExtraction?.registrationNumber ?? ''),
    };
  }
  const { label, effectiveRegNumber } = resolved;

  // Look up revoked violation for this product
  const revokedKey = `${regNumber}|${productName}`;
  const revokedViolation = revokedViolations?.get(revokedKey);

  const { violations, proposedValues, shouldExclude, exclusionReason } =
    await checkSingleJobConformity({
      job,
      label,
      allJobsForProduct,
      userNotesRules,
      revokedViolation,
    });

  // Add violation if label is missing for pesticide or fertilizer
  const requiresLabel =
    productStock?.product?.category === 'PESTICIDE' ||
    productStock?.product?.category === 'FERTILIZER';

  if (!label && requiresLabel) {
    violations.push({
      type: 'LABEL_NOT_FOUND',
      message: `Etichetta non trovata per il prodotto "${productName}" (reg. ${regNumber || 'N/A'}). Impossibile verificare conformità dose e applicazioni.`,
      severity: 'WARNING',
      source: 'SYSTEM',
      field: 'label',
    });
  }

  // Add violations from active ingredient compatibility
  const compatKey = `${productName}|${regNumber}`;
  const compatResult = compatibilityResults.get(compatKey);
  if (compatResult && !compatResult.isCompatible) {
    violations.push({
      type: 'ACTIVE_INGREDIENT_INCOMPATIBILITY',
      message: compatResult.reason ?? 'Incompatibilità principio attivo rilevata',
      severity: 'ERROR',
      source: 'LABEL',
    });
  }

  // Add warnings from user notes
  violations.push(...userNotesWarnings);

  return {
    jobId: job.id,
    productionUnitId: job.productionUnitId,
    productName,
    registrationNumber: effectiveRegNumber,
    wasAlreadyChecked: false,
    isConform: violations.filter((v: ConformityViolation) => v.severity === 'ERROR').length === 0,
    violations,
    originalValues: {
      quantity: job.quantity,
      unitOfMeasureQuantity: job.unitOfMeasureQuantity,
      dateOfOpeation: job.dateOfOpeation,
      treatedSurface: job.productionUnit.areaHa,
    },
    proposedValues: {
      ...proposedValues,
      note: buildConformityNote({
        productName,
        quantity: proposedValues.quantity,
        unitOfMeasureQuantity: proposedValues.unitOfMeasureQuantity,
        treatedSurfaceHa: job.productionUnit.areaHa,
        existingNote: job.note ?? null,
        proposedNote: proposedValues.note,
      }),
    },
    shouldExclude,
    exclusionReason,
  };
}
