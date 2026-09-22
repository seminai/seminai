import { JobOptimizationProposal, ConfirmConformityCheckInput, ConfirmConformityCheckOutput, JobConfirmationResult } from './types';
import { loadLabelForJob, loadJobsForConfirmation } from './loaders';
import { Prisma } from '@prisma/client';
import { extractLabelFromExtraction } from './matchers';
import { buildConformityAlertNotes, buildConformityNote } from './builders';
import { prisma } from '../../../repositories/Prisma';
import { buildConformJobUpdateData, buildExcludedJobUpdateData, computeStockAggregates } from './index.part-07-compute-stock-aggregates';

/**
 * Confirms and applies optimization proposals.
 * Uses a batch transaction to ensure atomicity — either all jobs update or none do.
 */
export async function confirmConformityCheck(
  input: ConfirmConformityCheckInput,
): Promise<ConfirmConformityCheckOutput> {
  console.log(`[CONFORMITY-CHECKER] Confirming proposals for jobGroupId: ${input.jobGroupId}`);
  console.log(`[CONFORMITY-CHECKER] Proposals to apply: ${input.proposals.length}`);

  const proposalsToApply = input.jobIds
    ? input.proposals.filter((p) => input.jobIds!.includes(p.jobId))
    : input.proposals;

  console.log(`[CONFORMITY-CHECKER] Filtered proposals: ${proposalsToApply.length}`);

  // Load jobs and compute stock aggregates
  const jobById = await loadJobsForConfirmation(input.jobGroupId);
  const { totalRequiredByProductId, quantityUnitByProductId, availableStockByProductId } =
    await computeStockAggregates(proposalsToApply, jobById);

  // Phase 1: Pre-compute all update data (outside transaction)
  const updateOperations: Array<{
    proposal: JobOptimizationProposal;
    updateData: Prisma.JobUpdateInput;
    jobResult: JobConfirmationResult;
  }> = [];
  const precomputeErrors: JobConfirmationResult[] = [];

  for (const proposal of proposalsToApply) {
    try {
      const existingJob = jobById.get(proposal.jobId) ?? null;
      if (!existingJob) {
        throw new Error(`Job ${proposal.jobId} not found`);
      }

      const jobWithRelations = existingJob;
      const treatedSurfaceHa = jobWithRelations.productionUnit.areaHa;
      const stock = jobWithRelations.stocks[0];
      const product = stock?.product;
      const productId = product?.id ?? null;
      const productName = proposal.productName || product?.name || '';
      const regNumberFromDb = product?.registrationNumber ?? null;
      const quantityUnit = productId ? quantityUnitByProductId.get(productId) ?? null : null;
      const totalStockRequiredForJobs = productId
        ? totalRequiredByProductId.get(productId) ?? null
        : null;
      const stockInWarehouse = productId ? availableStockByProductId.get(productId) ?? null : null;

      const labelExtraction = await loadLabelForJob({
        registrationNumber: regNumberFromDb || proposal.registrationNumber,
        productName,
      });
      const label = extractLabelFromExtraction(labelExtraction);
      const effectiveRegistrationNumber =
        (proposal.registrationNumber ?? '').trim() ||
        (regNumberFromDb ?? '').trim() ||
        (labelExtraction?.registrationNumber ?? '').trim();

      const alertNotes = await buildConformityAlertNotes({
        label,
        job: jobWithRelations,
        registrationNumber: effectiveRegistrationNumber,
        productId,
        productName,
        stockInWarehouse,
        stockInWarehouseUm: quantityUnit,
        totalStockRequiredForJobs,
        totalStockRequiredForJobsUm: quantityUnit,
      });

      if (proposal.shouldExclude) {
        const updateData = buildExcludedJobUpdateData(proposal, jobWithRelations, alertNotes);
        updateOperations.push({
          proposal,
          updateData,
          jobResult: {
            jobId: proposal.jobId,
            productName: proposal.productName,
            productionUnitId: proposal.productionUnitId,
            status: 'excluded',
            wasExcluded: true,
            finalQuantity: 0,
            originalQuantity: proposal.originalValues.quantity,
            unitOfMeasure: proposal.originalValues.unitOfMeasureQuantity,
            note: `[ESCLUSO] ${proposal.exclusionReason ?? 'Non conforme'}`,
          },
        });
      } else {
        const finalNote = buildConformityNote({
          productName,
          quantity: proposal.proposedValues.quantity,
          unitOfMeasureQuantity: proposal.proposedValues.unitOfMeasureQuantity,
          treatedSurfaceHa,
          existingNote: null,
          proposedNote: proposal.proposedValues.note,
          stockInWarehouse,
          totalStockRequired: totalStockRequiredForJobs,
        });

        const updateData = buildConformJobUpdateData(
          proposal,
          jobWithRelations,
          finalNote,
          alertNotes,
        );
        updateOperations.push({
          proposal,
          updateData,
          jobResult: {
            jobId: proposal.jobId,
            productName: proposal.productName,
            productionUnitId: proposal.productionUnitId,
            status: 'updated',
            wasExcluded: false,
            finalQuantity: proposal.proposedValues.quantity,
            originalQuantity: proposal.originalValues.quantity,
            unitOfMeasure: proposal.proposedValues.unitOfMeasureQuantity,
            note: finalNote,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[CONFORMITY-CHECKER] Error preparing update for job ${proposal.jobId}:`,
        error,
      );
      precomputeErrors.push({
        jobId: proposal.jobId,
        productName: proposal.productName,
        productionUnitId: proposal.productionUnitId,
        status: 'error',
        wasExcluded: false,
        finalQuantity: proposal.originalValues.quantity,
        originalQuantity: proposal.originalValues.quantity,
        unitOfMeasure: proposal.originalValues.unitOfMeasureQuantity,
        errorMessage,
      });
    }
  }

  // Phase 2: Execute all updates atomically
  let jobResults: JobConfirmationResult[] = [];
  let updatedCount = 0;
  let excludedCount = 0;
  let errorCount = precomputeErrors.length;

  if (updateOperations.length > 0) {
    try {
      await prisma.$transaction(
        updateOperations.map(({ proposal, updateData }) =>
          prisma.job.update({ where: { id: proposal.jobId }, data: updateData }),
        ),
      );

      // All succeeded
      for (const op of updateOperations) {
        jobResults.push(op.jobResult);
        updatedCount++;
        if (op.jobResult.wasExcluded) excludedCount++;
        console.log(
          `[CONFORMITY-CHECKER] Job ${op.proposal.jobId} ${op.jobResult.wasExcluded ? 'excluded' : 'updated'}`,
        );
      }
    } catch (error) {
      // All rolled back
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CONFORMITY-CHECKER] Transaction failed, all updates rolled back:`, error);

      errorCount += updateOperations.length;
      for (const op of updateOperations) {
        jobResults.push({
          ...op.jobResult,
          status: 'error',
          errorMessage: `Transazione fallita: ${errorMessage}`,
        });
      }
    }
  }

  // Add pre-compute errors
  jobResults = [...jobResults, ...precomputeErrors];

  const updatedJobIds = jobResults.filter((r) => r.status !== 'error').map((r) => r.jobId);

  console.log(
    `[CONFORMITY-CHECKER] Confirmed ${updatedCount} jobs, ${excludedCount} excluded, ${errorCount} errors`,
  );

  return {
    jobGroupId: input.jobGroupId,
    updatedJobsCount: updatedCount,
    excludedJobsCount: excludedCount,
    errorCount,
    updatedJobIds,
    jobResults,
  };
}
