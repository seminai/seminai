import { roundQuantity } from './unitConversion';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { PrismaStockRepository } from '../../../repositories/PrismaStockRepository';
import { prisma } from '../../../repositories/Prisma';
import { parseProductName } from '../../../services/utils/ProductNameParser';
import { ProductSummary, ProductionUnitMetadata, RequestedProduct, normalizeRegistrationNumber } from './fillTheJob.part-01-requested-product';
import { extractIncomingStock, resolveProductionUnitMetadata } from './fillTheJob.part-02-format-rule-violations-as-text';
import { createIncomingStockMovement, findOrCreateProduct } from './fillTheJob.part-03-find-or-create-product';

export function aggregateRequestedProducts(products: ReadonlyArray<RequestedProduct>): Array<{
  name: string;
  registrationNumber: string;
  rawRegistrationNumber: string;
  quantity: number;
  unit: string;
}> {
  const map = new Map<
    string,
    {
      name: string;
      registrationNumber: string;
      rawRegistrationNumber: string;
      quantity: number;
      unit: string;
    }
  >();
  for (const product of products ?? []) {
    if (!product) {
      continue;
    }
    const name = String(
      (product as { productName?: string; name?: string }).productName ??
        (product as { name?: string }).name ??
        '',
    ).trim();
    const rawRegNumber = String(
      (product as { registrationNumber?: string; regNumber?: string }).registrationNumber ??
        (product as { regNumber?: string }).regNumber ??
        '',
    ).trim();
    const normalizedRegNumber = normalizeRegistrationNumber(rawRegNumber);
    const incoming = extractIncomingStock(product);
    if (!name || !normalizedRegNumber || !incoming) {
      continue;
    }
    const key = `${name.toLowerCase()}|${normalizedRegNumber}|${incoming.unitOfMeasure.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity = roundQuantity(existing.quantity + incoming.quantity);
    } else {
      map.set(key, {
        name,
        registrationNumber: normalizedRegNumber,
        rawRegistrationNumber: rawRegNumber,
        quantity: incoming.quantity,
        unit: incoming.unitOfMeasure,
      });
    }
  }
  return Array.from(map.values()).filter((item) => item.quantity > 0);
}

export async function ensureWarehouseStockForRequestedProducts(params: {
  readonly requestedProducts?: ReadonlyArray<RequestedProduct>;
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly productionUnitCache: Map<string, ProductionUnitMetadata>;
  readonly productCache: Map<string, ProductSummary>;
  readonly stockRepository: PrismaStockRepository;
  readonly warnings: string[];
}): Promise<void> {
  if (!params.requestedProducts || params.requestedProducts.length === 0) {
    return;
  }
  const firstUnitId = params.units.find(
    (unit) => typeof unit.unitProductionId === 'string',
  )?.unitProductionId;
  if (!firstUnitId) {
    params.warnings.push(
      'Unable to load requested products into warehouse: missing production unit metadata',
    );
    return;
  }
  const metadata = await resolveProductionUnitMetadata(
    prisma,
    firstUnitId,
    params.productionUnitCache,
  );
  if (!metadata.companyId || !metadata.warehouseId) {
    params.warnings.push(
      'Unable to load requested products into warehouse: missing company or warehouse',
    );
    return;
  }
  const grouped = aggregateRequestedProducts(params.requestedProducts);
  for (const product of grouped) {
    const matched = await findOrCreateProduct(
      prisma,
      {
        name: product.name,
        registrationNumber: product.rawRegistrationNumber || product.registrationNumber,
        companyId: metadata.companyId,
        warehouseId: metadata.warehouseId,
      },
      params.productCache,
      params.warnings,
    );
    if (!matched) {
      continue;
    }
    const parsedProduct = parseProductName(product.name);
    try {
      await createIncomingStockMovement(params.stockRepository, {
        productId: matched.id,
        quantity: product.quantity,
        unitOfMeasure: product.unit,
        productName: product.name,
        notes: parsedProduct.baseName !== product.name ? product.name : null,
        packagingInfo: parsedProduct.packagingInfo,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      params.warnings.push(`Failed to create incoming stock for ${product.name}: ${errorMsg}`);
    }
  }
}

export interface FillProductTreatment {
  readonly data_distribuzione?: string | null;
  readonly dose?: number | null;
  readonly dosaggio_um?: string | null;
  readonly isLocalizedTreatment?: boolean | null;
  readonly note?: string | null;
  readonly application?: string | null;
  readonly epoca_impiego?: string | null;
  readonly fasce_rispetto_acqua?: string | null;
  readonly fasce_rispetto_colture?: string | null;
  readonly ddt_date_is_ok?: boolean | null;
  readonly ddt_date_conformity?: string | null;
  readonly ddt_date_after_treatment?: boolean | null;
}
