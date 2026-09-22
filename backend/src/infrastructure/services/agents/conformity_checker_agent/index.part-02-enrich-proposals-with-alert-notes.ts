import { ConformityCheckOutput, JobOptimizationProposal, JobWithRelations, LabelMap } from './types';
import { loadLabelForJob, loadCompanyIdsByProductIds } from './loaders';
import { calculateAggregatedStock } from '../dosage_agent/stockAggregator';
import { prisma } from '../../../repositories/Prisma';
import { extractLabelFromExtraction, resolveLabel } from './matchers';
import { buildConformityAlertNotes, buildConformityNote } from './builders';

/**
 * Enriches proposals with alert notes and stock information
 */
export async function enrichProposalsWithAlertNotes(
  proposals: JobOptimizationProposal[],
  allJobs: JobWithRelations[],
  labelByRegNumber?: LabelMap,
  labelByProductName?: LabelMap,
): Promise<JobOptimizationProposal[]> {
  if (proposals.length === 0) {
    return [];
  }

  const jobsById = new Map<string, JobWithRelations>();
  for (const job of allJobs) {
    jobsById.set(job.id, job);
  }

  // Collect unique product IDs and their data
  const uniqueProductIds = new Set<string>();
  const quantityUnitByProductId = new Map<string, string>();

  for (const job of allJobs) {
    const stock = job.stocks[0];
    const product = stock?.product;
    if (!product) continue;

    uniqueProductIds.add(product.id);
    if (!quantityUnitByProductId.has(product.id)) {
      quantityUnitByProductId.set(product.id, job.unitOfMeasureQuantity);
    }
  }

  // Load company IDs in a single batch query
  const productIdArray = Array.from(uniqueProductIds);
  const companyIdByProductId = await loadCompanyIdsByProductIds(productIdArray);

  // Calculate total required per product
  const totalRequiredByProductId = new Map<string, number>();
  for (const proposal of proposals) {
    const job = jobsById.get(proposal.jobId);
    if (!job) continue;

    const stock = job.stocks[0];
    const product = stock?.product;
    if (!product) continue;

    const finalQuantity = proposal.shouldExclude ? 0 : proposal.proposedValues.quantity;
    totalRequiredByProductId.set(
      product.id,
      (totalRequiredByProductId.get(product.id) ?? 0) + finalQuantity,
    );
  }

  // Calculate aggregated stock in parallel
  const stockEntries = Array.from(companyIdByProductId.entries());
  const stockResults = await Promise.all(
    stockEntries.map(([productId, companyId]) =>
      calculateAggregatedStock(prisma, { productId, companyId }),
    ),
  );

  const availableStockByProductId = new Map<string, number>();
  stockEntries.forEach(([productId], index) => {
    availableStockByProductId.set(productId, stockResults[index].availableStock);
  });

  // Enrich proposals in parallel batches
  const ENRICH_BATCH_SIZE = 10;
  const enrichedProposals: JobOptimizationProposal[] = [];

  for (let i = 0; i < proposals.length; i += ENRICH_BATCH_SIZE) {
    const batch = proposals.slice(i, i + ENRICH_BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (proposal) => {
        const job = jobsById.get(proposal.jobId);
        if (!job) {
          return proposal;
        }

        const stock = job.stocks[0];
        const product = stock?.product;
        if (!product) {
          return proposal;
        }

        const productId = product.id;
        const quantityUnit = quantityUnitByProductId.get(productId) ?? null;
        const stockInWarehouse = availableStockByProductId.get(productId) ?? null;
        const totalStockRequiredForJobs = totalRequiredByProductId.get(productId) ?? null;

        // Resolve label from cached maps or DB
        const regNumberForLookup = product.registrationNumber ?? proposal.registrationNumber ?? '';
        let label: import('../../../../domain/dtos/label.dto').Label | null;
        let effectiveRegistrationNumber: string;
        if (labelByRegNumber && labelByProductName) {
          const resolved = resolveLabel(
            regNumberForLookup,
            proposal.productName,
            labelByRegNumber,
            labelByProductName,
          );
          label = resolved.label;
          effectiveRegistrationNumber =
            (proposal.registrationNumber ?? '').trim() ||
            (product.registrationNumber ?? '').trim() ||
            resolved.effectiveRegNumber;
        } else {
          const labelExtraction = await loadLabelForJob({
            registrationNumber: regNumberForLookup,
            productName: proposal.productName,
          });
          label = extractLabelFromExtraction(labelExtraction);
          effectiveRegistrationNumber =
            (proposal.registrationNumber ?? '').trim() ||
            (product.registrationNumber ?? '').trim() ||
            (labelExtraction?.registrationNumber ?? '').trim();
        }

        const alertNotes = await buildConformityAlertNotes({
          label,
          job,
          registrationNumber: effectiveRegistrationNumber,
          productId,
          productName: proposal.productName,
          stockInWarehouse,
          stockInWarehouseUm: quantityUnit,
          totalStockRequiredForJobs,
          totalStockRequiredForJobsUm: quantityUnit,
        });

        const enrichedNote = buildConformityNote({
          productName: proposal.productName,
          quantity: proposal.proposedValues.quantity,
          unitOfMeasureQuantity: proposal.proposedValues.unitOfMeasureQuantity,
          treatedSurfaceHa: job.productionUnit.areaHa,
          existingNote: null,
          proposedNote: proposal.proposedValues.note,
          stockInWarehouse,
          totalStockRequired: totalStockRequiredForJobs,
        });

        return {
          ...proposal,
          proposedValues: {
            ...proposal.proposedValues,
            note: enrichedNote,
            alertNotes: alertNotes as unknown as Record<string, unknown>,
          },
        };
      }),
    );

    enrichedProposals.push(...batchResults);
  }

  return enrichedProposals;
}

/**
 * Calculates summary statistics from proposals
 */
export function calculateSummary(
  allJobsCount: number,
  alreadyCheckedCount: number,
  newlyCheckedCount: number,
  proposals: JobOptimizationProposal[],
): ConformityCheckOutput['summary'] {
  const errorCount = proposals.reduce(
    (sum, p) => sum + p.violations.filter((v) => v.severity === 'ERROR').length,
    0,
  );
  const warningCount = proposals.reduce(
    (sum, p) => sum + p.violations.filter((v) => v.severity === 'WARNING').length,
    0,
  );

  return {
    totalJobs: allJobsCount,
    alreadyCheckedJobs: alreadyCheckedCount,
    newlyCheckedJobs: newlyCheckedCount,
    conformJobs: proposals.filter((p) => p.isConform).length,
    nonConformJobs: proposals.filter((p) => !p.isConform).length,
    jobsToExclude: proposals.filter((p) => p.shouldExclude).length,
    totalViolations: proposals.reduce((sum, p) => sum + p.violations.length, 0),
    errorCount,
    warningCount,
  };
}

/**
 * Returns empty output when no jobs are found
 */
export function createEmptyOutput(jobGroupId: string): ConformityCheckOutput {
  return {
    jobGroupId,
    proposals: [],
    summary: {
      totalJobs: 0,
      alreadyCheckedJobs: 0,
      newlyCheckedJobs: 0,
      conformJobs: 0,
      nonConformJobs: 0,
      jobsToExclude: 0,
      totalViolations: 0,
      errorCount: 0,
      warningCount: 0,
    },
    checkedAt: new Date(),
  };
}
