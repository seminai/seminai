import { PrismaClient } from '@prisma/client';
import { buildProductKey } from './productAccessors';

/**
 * Parameters for calculating aggregated stock
 */
export interface AggregatedStockParams {
  readonly productId: string;
  readonly companyId: string;
}

/**
 * Result of aggregated stock calculation
 */
export interface AggregatedStockResult {
  readonly stockInTotal: number;
  readonly stockOutVerifiedTotal: number;
  readonly availableStock: number;
}

/**
 * Parameters for bulk stock calculation by product name and registration number
 */
export interface BulkStockByProductKeyParams {
  readonly companyId: string;
  readonly productKeys: ReadonlyArray<{
    readonly name: string;
    readonly regNumber: string;
  }>;
}

/**
 * Calculates the aggregated stock for a product within a company.
 *
 * Stock calculation logic:
 * - Stock IN: Sum of all movements with quantity > 0 and type = 'IN'
 * - Stock OUT: Sum of all movements with quantity < 0, type = 'OUT', and either
 *   no jobId (manual/treatment stock movement) or job.isVerified = true
 * - Available Stock = Stock IN + Stock OUT (OUT is negative, so it subtracts)
 *
 * Note: Stock OUT from non-verified jobs does NOT count as consumed.
 */
export async function calculateAggregatedStock(
  prisma: PrismaClient,
  params: AggregatedStockParams,
): Promise<AggregatedStockResult> {
  const { productId, companyId } = params;

  // Stock IN: only quantity > 0 and type = 'IN', filtered by company
  const stockInBalance = await prisma.stock.aggregate({
    where: {
      productId,
      quantity: { gt: 0 },
      type: 'IN',
      product: { warehouse: { companyId } },
    },
    _sum: { quantity: true },
  });

  // Stock OUT: manual/treatment movements (jobId null) and verified jobs count as consumed.
  const stockOutVerifiedBalance = await prisma.stock.aggregate({
    where: {
      productId,
      quantity: { lt: 0 },
      type: 'OUT',
      OR: [{ jobId: null }, { job: { isVerified: true } }],
      product: { warehouse: { companyId } },
    },
    _sum: { quantity: true },
  });

  const stockInTotal = stockInBalance._sum.quantity ?? 0;
  const stockOutVerifiedTotal = stockOutVerifiedBalance._sum.quantity ?? 0;
  // Available stock = IN + OUT verified (OUT is negative, so it subtracts)
  const availableStock = stockInTotal + stockOutVerifiedTotal;

  return {
    stockInTotal,
    stockOutVerifiedTotal,
    availableStock,
  };
}

// buildProductKey is imported from productAccessors (line 2) for consistent normalization.
// Re-exported for backwards compatibility with existing consumers.
export { buildProductKey };

/**
 * Calculates aggregated stock for multiple products in bulk.
 * Returns a Map where keys are "productName|regNumber" and values are available stock.
 *
 * This is more efficient than calling calculateAggregatedStock for each product
 * when dealing with multiple products from the same company.
 */
export async function calculateBulkAggregatedStock(
  prisma: PrismaClient,
  params: BulkStockByProductKeyParams,
): Promise<Map<string, AggregatedStockResult>> {
  const { companyId, productKeys } = params;
  const resultMap = new Map<string, AggregatedStockResult>();

  if (productKeys.length === 0) {
    return resultMap;
  }

  // Find all products matching the given names and registration numbers for this company
  const products = await prisma.product.findMany({
    where: {
      warehouse: { companyId },
      OR: productKeys.map((pk) => ({
        name: pk.name,
        registrationNumber: pk.regNumber || null,
      })),
    },
    select: {
      id: true,
      name: true,
      registrationNumber: true,
    },
  });

  // Calculate stock for each found product
  for (const product of products) {
    const key = buildProductKey(product.name, product.registrationNumber ?? '');
    const stockResult = await calculateAggregatedStock(prisma, {
      productId: product.id,
      companyId,
    });
    resultMap.set(key, stockResult);
  }

  return resultMap;
}

/**
 * Calculates aggregated stock for a single product identified by name and registration number.
 * Returns null if the product is not found.
 */
export async function calculateAggregatedStockByProductKey(
  prisma: PrismaClient,
  companyId: string,
  productName: string,
  regNumber: string,
): Promise<AggregatedStockResult | null> {
  // Find the product
  const product = await prisma.product.findFirst({
    where: {
      warehouse: { companyId },
      name: productName,
      registrationNumber: regNumber || null,
    },
    select: { id: true },
  });

  if (!product) {
    return null;
  }

  return calculateAggregatedStock(prisma, {
    productId: product.id,
    companyId,
  });
}
