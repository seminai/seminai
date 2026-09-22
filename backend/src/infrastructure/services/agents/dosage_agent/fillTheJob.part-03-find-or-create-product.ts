import type { Prisma, PrismaClient } from '@prisma/client';
import { parseProductName, resolveOfficialName, convertPiecesToRealUnit, isPiecesUnit } from '../../../services/utils/ProductNameParser';
import { PrismaProductRepository } from '../../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../../repositories/PrismaStockRepository';
import { CreateProductUseCase } from '../../../../application/use-cases/product/CreateProductUseCase';
import { ProductCategory } from '@prisma/client';
import { Stock } from '../../../../domain/entities/Stock';
import { DEFAULT_PRICE_UNIT, ProductSummary, STOCK_IN_TYPE, normalizeName, normalizeRegistrationNumber } from './fillTheJob.part-01-requested-product';

export async function findOrCreateProduct(
  prisma: PrismaClient,
  params: {
    readonly name: string;
    readonly registrationNumber: string;
    readonly companyId: string | null;
    readonly warehouseId: string | null;
  },
  cache: Map<string, ProductSummary>,
  warnings: string[],
): Promise<ProductSummary | null> {
  const parsed = parseProductName(params.name);
  const officialName = resolveOfficialName(parsed.baseName);
  const normalizedName = normalizeName(officialName);
  const normalizedRegistrationNumber = normalizeRegistrationNumber(params.registrationNumber);
  const cacheKey = `${params.companyId ?? 'GLOBAL'}|${normalizedRegistrationNumber || 'NO-REG'}|${normalizedName || 'NO-NAME'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const companyFilter: Prisma.ProductWhereInput = params.companyId
    ? { warehouse: { companyId: params.companyId } }
    : {};

  const productSelect = {
    id: true,
    name: true,
    sku: true,
    registrationNumber: true,
    category: true,
  } satisfies Prisma.ProductSelect;

  const registrationCandidates = new Set<string>();
  if (normalizedRegistrationNumber) {
    registrationCandidates.add(normalizedRegistrationNumber);
  }
  if (params.registrationNumber && params.registrationNumber !== normalizedRegistrationNumber) {
    registrationCandidates.add(params.registrationNumber);
  }

  let product: Prisma.ProductGetPayload<{ select: typeof productSelect }> | null = null;

  const rawRegistrationComparable = params.registrationNumber?.trim().toLowerCase() ?? '';
  const doesRegistrationMatch = (value: string | null | undefined): boolean => {
    if (normalizedRegistrationNumber) {
      return normalizeRegistrationNumber(value ?? '') === normalizedRegistrationNumber;
    }
    if (!rawRegistrationComparable) {
      return false;
    }
    return (
      String(value ?? '')
        .trim()
        .toLowerCase() === rawRegistrationComparable
    );
  };
  const isNameCompatible = (value: string | null | undefined): boolean => {
    if (!normalizedName) {
      return true;
    }
    const normalizedCandidateName = normalizeName(value ?? '');
    if (!normalizedCandidateName) {
      return false;
    }
    return (
      normalizedCandidateName === normalizedName ||
      normalizedCandidateName.includes(normalizedName) ||
      normalizedName.includes(normalizedCandidateName)
    );
  };

  if (registrationCandidates.size > 0) {
    const candidates = await prisma.product.findMany({
      where: {
        ...companyFilter,
        OR: Array.from(registrationCandidates).map((value) => ({ registrationNumber: value })),
      },
      select: productSelect,
    });
    product =
      candidates.find(
        (candidate) =>
          doesRegistrationMatch(candidate.registrationNumber) && isNameCompatible(candidate.name),
      ) ?? null;
  }

  if (!product && normalizedRegistrationNumber) {
    const partialName = params.name.trim();
    const nameFilteredCandidates = await prisma.product.findMany({
      where: {
        ...companyFilter,
        ...(partialName
          ? {
              name: {
                contains: partialName,
                mode: 'insensitive',
              },
            }
          : {}),
        registrationNumber: { not: null },
      },
      select: productSelect,
    });
    product =
      nameFilteredCandidates.find(
        (candidate) =>
          doesRegistrationMatch(candidate.registrationNumber) && isNameCompatible(candidate.name),
      ) ?? null;
  }

  if (!product && normalizedName) {
    product = await prisma.product.findFirst({
      where: {
        ...companyFilter,
        OR: [
          { name: { equals: officialName, mode: 'insensitive' } },
          { name: { equals: parsed.baseName, mode: 'insensitive' } },
          { name: { equals: params.name, mode: 'insensitive' } },
        ],
      },
      select: productSelect,
    });
  }

  if (!product && params.warehouseId) {
    const logRegistrationNumber =
      normalizedRegistrationNumber || params.registrationNumber || 'N/A';
    console.log(
      `[FILL-JOB] Product not found, creating: ${officialName} (reg: ${logRegistrationNumber})`,
    );

    const productRepository = new PrismaProductRepository(prisma);
    const stockRepository = new PrismaStockRepository(prisma);
    const createProductUseCase = new CreateProductUseCase(productRepository, stockRepository);

    try {
      const newProduct = await createProductUseCase.execute({
        warehouseId: params.warehouseId,
        name: officialName,
        sku: `SKU-${normalizedRegistrationNumber || params.registrationNumber || Date.now()}`,
        category: ProductCategory.PESTICIDE, // Default to PESTICIDE for fitosanitari
        type: 'Fitosanitario',
        registrationNumber: normalizedRegistrationNumber || params.registrationNumber || null,
        stock: null,
      });

      console.log(
        `[FILL-JOB] Product created: ${newProduct.product.name} (ID: ${newProduct.product.id})`,
      );

      product = {
        id: newProduct.product.id,
        name: newProduct.product.name,
        sku: newProduct.product.sku,
        registrationNumber: newProduct.product.registrationNumber,
        category: newProduct.product.category,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error creating product';
      console.error(`[FILL-JOB] Error creating product ${params.name}:`, errorMsg);
      warnings.push(`Failed to create product ${params.name}: ${errorMsg}`);
      return null;
    }
  } else if (!product) {
    warnings.push(
      `Cannot create product ${params.name}: no warehouse available for company ${params.companyId}`,
    );
    return null;
  }

  const summary: ProductSummary = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    registrationNumber: product.registrationNumber ?? null,
    category: product.category,
  };
  cache.set(cacheKey, summary);
  return summary;
}

export async function createIncomingStockMovement(
  stockRepository: PrismaStockRepository,
  params: {
    readonly productId: string;
    readonly quantity: number;
    readonly unitOfMeasure: string;
    readonly productName?: string;
    readonly notes?: string | null;
    readonly packagingInfo?: string | null;
  },
): Promise<Stock> {
  if (params.quantity <= 0) {
    throw new Error('Quantity must be greater than 0');
  }
  let quantity = params.quantity;
  let unit = params.unitOfMeasure;
  let stockPackagingInfo = params.packagingInfo ?? null;
  if (params.productName && isPiecesUnit(unit)) {
    const conversion = convertPiecesToRealUnit(quantity, unit, params.productName);
    if (conversion.converted) {
      quantity = conversion.quantity;
      unit = conversion.unitOfMeasure;
      stockPackagingInfo = conversion.packagingInfo;
    }
  }
  const stockEntity = Stock.create({
    productId: params.productId,
    quantity,
    unitOfMeasureQuantity: unit,
    price: 0,
    unitOfMeasurePrice: DEFAULT_PRICE_UNIT,
    type: STOCK_IN_TYPE,
    notes: params.notes ?? null,
    packagingInfo: stockPackagingInfo,
  });
  const created = await stockRepository.create(stockEntity);
  return created;
}
