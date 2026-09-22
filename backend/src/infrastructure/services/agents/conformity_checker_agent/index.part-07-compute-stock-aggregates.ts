import { JobOptimizationProposal, JobWithRelations } from './types';
import { calculateAggregatedStock } from '../dosage_agent/stockAggregator';
import { prisma } from '../../../repositories/Prisma';
import { Prisma } from '@prisma/client';

/**
 * Computes stock aggregates for all products in proposals
 */
export async function computeStockAggregates(
  proposals: ReadonlyArray<JobOptimizationProposal>,
  jobById: Map<string, JobWithRelations>,
): Promise<{
  totalRequiredByProductId: Map<string, number>;
  quantityUnitByProductId: Map<string, string>;
  availableStockByProductId: Map<string, number>;
}> {
  const totalRequiredByProductId = new Map<string, number>();
  const quantityUnitByProductId = new Map<string, string>();
  const companyIdByProductId = new Map<string, string>();

  for (const proposal of proposals) {
    const job = jobById.get(proposal.jobId);
    if (!job) continue;

    const stock = job.stocks[0];
    const product = stock?.product as unknown as
      | { id: string; warehouse?: { companyId?: string } }
      | undefined;
    if (!product) continue;

    const finalQuantity = proposal.shouldExclude ? 0 : proposal.proposedValues.quantity;
    totalRequiredByProductId.set(
      product.id,
      (totalRequiredByProductId.get(product.id) ?? 0) + finalQuantity,
    );

    if (!quantityUnitByProductId.has(product.id)) {
      quantityUnitByProductId.set(product.id, job.unitOfMeasureQuantity);
    }

    const companyId = product.warehouse?.companyId;
    if (companyId && !companyIdByProductId.has(product.id)) {
      companyIdByProductId.set(product.id, companyId);
    }
  }

  const availableStockByProductId = new Map<string, number>();
  for (const [productId, companyId] of companyIdByProductId.entries()) {
    const aggregated = await calculateAggregatedStock(prisma, { productId, companyId });
    availableStockByProductId.set(productId, aggregated.availableStock);
  }

  return { totalRequiredByProductId, quantityUnitByProductId, availableStockByProductId };
}

/**
 * Builds update data for an excluded job (pure function, no DB calls)
 */
export function buildExcludedJobUpdateData(
  proposal: JobOptimizationProposal,
  job: JobWithRelations,
  alertNotes: unknown,
): Prisma.JobUpdateInput {
  const treatedSurfaceHa = job.productionUnit.areaHa;
  const finalNote =
    `[ESCLUSO] ${proposal.exclusionReason ?? 'Non conforme'}. ${proposal.proposedValues.note ?? ''}`.trim();

  return {
    quantity: 0,
    conformityChecked: true,
    note: finalNote,
    treatedSurface: treatedSurfaceHa,
    productQuantityTreated: treatedSurfaceHa,
    unitOfMeasureProductQuantityTreated: treatedSurfaceHa ? 'ha' : null,
    alertNotes: alertNotes as Prisma.InputJsonValue,
  };
}

/**
 * Builds update data for a conform job (pure function, no DB calls)
 */
export function buildConformJobUpdateData(
  proposal: JobOptimizationProposal,
  job: JobWithRelations,
  finalNote: string,
  alertNotes: unknown,
): Prisma.JobUpdateInput {
  const treatedSurfaceHa = job.productionUnit.areaHa;

  return {
    quantity: proposal.proposedValues.quantity,
    unitOfMeasureQuantity: proposal.proposedValues.unitOfMeasureQuantity,
    conformityChecked: true,
    treatedSurface: treatedSurfaceHa,
    productQuantityTreated: treatedSurfaceHa,
    unitOfMeasureProductQuantityTreated: treatedSurfaceHa ? 'ha' : null,
    note: finalNote,
    alertNotes: alertNotes as Prisma.InputJsonValue,
  };
}
