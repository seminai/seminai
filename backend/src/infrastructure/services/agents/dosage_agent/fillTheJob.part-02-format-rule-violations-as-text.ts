import { RuleViolationDetail } from '../../../../domain/dtos/rule-rag.types';
import { UnitScheduledJob, UnitJobStockSummary, UnitJobStockProductSummary } from './flowMatchCropTreatment';
import type { PrismaClient } from '@prisma/client';
import { ensureWarehouseForCompany } from './batchLoader';
import { JobWithStocksAndProduct, ProductionUnitMetadata, normalizeQuantityUnit } from './fillTheJob.part-01-requested-product';

/**
 * Formats rule violations into a human-readable text for alert notes.
 */
export function formatRuleViolationsAsText(violations: ReadonlyArray<RuleViolationDetail>): string | null {
  if (!violations || violations.length === 0) return null;
  return violations
    .map(
      (v) =>
        `[${v.severity}] ${v.ruleName} (${v.ruleCategory}): ${v.description}` +
        (v.suggestedAction ? ` - ${v.suggestedAction}` : ''),
    )
    .join('\n');
}

// Products arriving here are loosely typed objects coming from multiple flows (label extraction,
// matching, LLM). We keep the parameter as `unknown` on purpose and pluck only the fields we need,
// instead of pretending we have a strict DTO.
export function extractIncomingStock(
  product: unknown,
): { quantity: number; unitOfMeasure: string } | null {
  // Crea stock IN SOLO se loadWarehouse === true (esplicitamente richiesto).
  // Se loadWarehouse è false o undefined/assente, NON creare STOCK_IN.
  const loadWarehouseFlag = (product as { loadWarehouse?: boolean }).loadWarehouse;
  if (loadWarehouseFlag !== true) {
    return null;
  }
  const quantity =
    typeof (product as { quantity?: number }).quantity === 'number'
      ? (product as { quantity: number }).quantity
      : undefined;
  if (!quantity || quantity <= 0) {
    return null;
  }
  const unit = normalizeQuantityUnit(
    (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure ?? null,
  );
  return { quantity, unitOfMeasure: unit };
}

export function mapJob(job: JobWithStocksAndProduct): UnitScheduledJob {
  const stocks: UnitJobStockSummary[] = job.stocks.map((stock) => {
    const product: UnitJobStockProductSummary = {
      id: stock.product.id,
      name: stock.product.name,
      sku: stock.product.sku,
      registrationNumber: stock.product.registrationNumber ?? null,
      category: stock.product.category,
    };
    return {
      id: stock.id,
      productId: stock.productId,
      quantity: stock.quantity,
      unitOfMeasureQuantity: stock.unitOfMeasureQuantity,
      price: stock.price,
      unitOfMeasurePrice: stock.unitOfMeasurePrice,
      type: stock.type,
      product,
    };
  });

  return {
    id: job.id,
    jobId: job.jobId ?? null,
    productionUnitId: job.productionUnitId,
    dateOfOpeation: job.dateOfOpeation,
    isVerified: job.isVerified,
    category: job.category,
    quantity: job.quantity,
    unitOfMeasureQuantity: job.unitOfMeasureQuantity,
    productQuantityTreated: job.productQuantityTreated,
    unitOfMeasureProductQuantityTreated: job.unitOfMeasureProductQuantityTreated,
    modeOfApplication: job.modeOfApplication,
    avversity: job.avversity,
    giustification: job.giustification,
    treatedSurface: job.treatedSurface,
    isLocalizedTreatment: job.isLocalizedTreatment,
    userId: job.userId,
    note: job.note,
    totalDistributedWaterL: job.totalDistributedWaterL,
    machineId: job.machineId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    stocks,
  };
}

export async function resolveProductionUnitMetadata(
  prisma: PrismaClient,
  productionUnitId: string,
  cache: Map<string, ProductionUnitMetadata>,
): Promise<ProductionUnitMetadata> {
  const cached = cache.get(productionUnitId);
  if (cached) {
    return cached;
  }

  const productionUnit = await prisma.productionUnit.findUnique({
    where: { id: productionUnitId },
    include: {
      productionUnitsOnFields: {
        include: {
          field: {
            select: {
              companyId: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const productionUnitName = productionUnit?.name ?? null;
  const firstRelation = productionUnit?.productionUnitsOnFields.find(
    (relation) => relation.field?.companyId,
  );
  const companyId = firstRelation?.field?.companyId ?? null;
  const companyName = firstRelation?.field?.company?.name ?? null;

  let warehouseId: string | null = null;
  if (companyId) {
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId },
      select: { id: true },
      take: 1,
    });

    if (warehouses.length === 0) {
      console.log(
        `[FILL-JOB] No warehouse found for company ${companyId}, creating default warehouse...`,
      );
      try {
        warehouseId = await ensureWarehouseForCompany(prisma, companyId);
        if (warehouseId) {
          console.log(`[FILL-JOB] Default warehouse ensured: ${warehouseId}`);
        }
      } catch (error) {
        console.error(`[FILL-JOB] Error creating default warehouse:`, error);
        warehouseId = null;
      }
    } else {
      warehouseId = warehouses[0].id;
    }
  }

  const metadata: ProductionUnitMetadata = {
    productionUnitId,
    productionUnitName,
    companyId,
    companyName,
    warehouseId,
  };
  cache.set(productionUnitId, metadata);
  return metadata;
}
