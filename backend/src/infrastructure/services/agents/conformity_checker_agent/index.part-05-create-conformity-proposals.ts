import { JobOptimizationProposal, ConformityViolation } from './types';
import { hasContext } from './context';
import { checkBufferZoneDoseConformity } from './bufferZoneChecker';
import { checkRulesCompliance } from './rulesComplianceChecker';
import { checkSAGroupLimits } from './saGroupChecker';
import { ConformityProposalParams } from './index.part-04-load-conformity-labels';
import { createJobProposal, groupJobsByUnitAndProduct } from './index.part-01-process-user-notes';

export async function createConformityProposals(
  params: ConformityProposalParams,
): Promise<JobOptimizationProposal[]> {
  const { allJobs, jobsToCheck, compatibilityResults, userNotesRules, userNotesWarnings, labelByRegNumber, labelByProductName, revokedViolations, fieldDataByUnit, derivedCompanyId, skipRulesCompliance, context, historyManager, logger } = params;
// 6. Group all jobs by unit and product for N max applications check
const jobsByUnitAndProduct = groupJobsByUnitAndProduct(allJobs);

// 7. Check each job (parallelized for performance)
const PARALLEL_BATCH_SIZE = 10; // Process jobs in parallel batches to avoid overwhelming resources

const proposals: JobOptimizationProposal[] = [];

// Process jobs in parallel batches
for (let i = 0; i < jobsToCheck.length; i += PARALLEL_BATCH_SIZE) {
  const batch = jobsToCheck.slice(i, i + PARALLEL_BATCH_SIZE);

  const batchProposals = await Promise.all(
    batch.map((job) => {
      const regNumber = job.stocks[0]?.product?.registrationNumber ?? '';
      const productName = job.stocks[0]?.product?.name ?? '';
      const unitProductKey = `${job.productionUnitId}|${regNumber || productName}`;
      const allJobsForProductOnUnit = jobsByUnitAndProduct.get(unitProductKey) ?? [];

      return createJobProposal(
        job,
        allJobsForProductOnUnit,
        compatibilityResults,
        userNotesRules,
        userNotesWarnings,
        labelByRegNumber,
        labelByProductName,
        revokedViolations,
      );
    }),
  );

  proposals.push(...batchProposals);

  // Log progress after each batch
  if (hasContext(context)) {
    const progress = Math.round(((i + batch.length) / jobsToCheck.length) * 100);
    logger.logProgress({
      jobId: context.jobId,
      userId: context.userId,
      progress,
      phase: 'Verifica interventi',
    });
  }
}

// 8. Cross-job validation checks
// Rules compliance runs first (extracts disciplinare info needed by SA group checker)
// Buffer zone runs in parallel with rules compliance
if (hasContext(context)) {
  logger.logFlow({
    jobId: context.jobId,
    userId: context.userId,
    message: 'Avvio controlli cross-job (disciplinari, gruppi SA, fasce rispetto)...',
  });
}

// 8a. Run buffer zone + rules compliance in parallel
const emptyRulesResult = {
  violations: new Map<string, ConformityViolation[]>(),
  disciplinareInfoMap: new Map(),
  resolvedCropNames: new Map(),
};

const [bufferZoneResult, rulesResult] = await Promise.all([
  checkBufferZoneDoseConformity(
    jobsToCheck,
    fieldDataByUnit,
    labelByRegNumber,
    labelByProductName,
    context,
    historyManager,
  ),
  derivedCompanyId && !skipRulesCompliance
    ? checkRulesCompliance(
        jobsToCheck,
        labelByRegNumber,
        labelByProductName,
        derivedCompanyId,
        context,
        historyManager,
      )
    : Promise.resolve(emptyRulesResult),
]);

const rulesViolations = rulesResult.violations;

// 8b. SA group check uses disciplinare info from rules compliance (avoids duplicate RAG queries)
const saGroupViolations = derivedCompanyId
  ? await checkSAGroupLimits(
      allJobs,
      labelByRegNumber,
      labelByProductName,
      rulesResult.disciplinareInfoMap,
      historyManager,
    )
  : new Map<string, ConformityViolation[]>();

console.log(
  `[CONFORMITY-CHECKER] Cross-job checks: buffer zone ${bufferZoneResult.violations.size} violations, SA group ${saGroupViolations.size} violations, rules ${rulesViolations.size} violations`,
);

if (hasContext(context)) {
  logger.logFlow({
    jobId: context.jobId,
    userId: context.userId,
    message: `Controlli cross-job completati: ${bufferZoneResult.violations.size + saGroupViolations.size + rulesViolations.size} violazioni trovate`,
    metadata: {
      bufferZoneViolations: bufferZoneResult.violations.size,
      saGroupViolations: saGroupViolations.size,
      rulesViolations: rulesViolations.size,
    },
  });
}

// 9. Merge cross-job violations into proposals
const mergedProposals = proposals.map((proposal) => {
  const additionalViolations: ConformityViolation[] = [];

  const bufferViolations = bufferZoneResult.violations.get(proposal.jobId);
  if (bufferViolations) additionalViolations.push(...bufferViolations);

  const saViolations = saGroupViolations.get(proposal.jobId);
  if (saViolations) additionalViolations.push(...saViolations);

  const rulesViols = rulesViolations.get(proposal.jobId);
  if (rulesViols) additionalViolations.push(...rulesViols);

  if (additionalViolations.length === 0) return proposal;

  const allViolations = [...proposal.violations, ...additionalViolations];
  const hasErrors = allViolations.some((v) => v.severity === 'ERROR');
  const shouldExclude =
    proposal.shouldExclude ||
    additionalViolations.some((v) => v.type === 'SA_GROUP_LIMIT_EXCEEDED');

  return {
    ...proposal,
    violations: allViolations,
    isConform: !hasErrors,
    shouldExclude,
    exclusionReason:
      shouldExclude && !proposal.shouldExclude
        ? additionalViolations.find((v) => v.type === 'SA_GROUP_LIMIT_EXCEEDED')?.message
        : proposal.exclusionReason,
    proposedValues:
      shouldExclude && !proposal.shouldExclude
        ? { ...proposal.proposedValues, quantity: 0 }
        : proposal.proposedValues,
  };
});
  return mergedProposals;
}
