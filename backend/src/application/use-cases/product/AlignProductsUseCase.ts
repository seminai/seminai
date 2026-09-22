import { PrismaClient, Prisma } from '@prisma/client';
import {
  parseProductName,
  resolveOfficialName,
  convertPiecesToRealUnit,
  isPiecesUnit,
} from '../../../infrastructure/services/utils/ProductNameParser';
import { ProductRegistrationLookupService } from '../../../infrastructure/services/utils/ProductRegistrationLookup';

type ProductWithStocks = Prisma.ProductGetPayload<{ include: { stocks: true } }>;

export interface AlignProductsInput {
  readonly productIds: string[];
  readonly companyId: string;
}

export interface AlignProductsResult {
  groupsMerged: number;
  productsMerged: number;
  stocksMoved: number;
  productsDeleted: number;
  errors: string[];
  details: AlignGroupDetail[];
}

export interface AlignGroupDetail {
  readonly baseName: string;
  readonly winnerId: string;
  readonly winnerName: string;
  readonly mergedProductIds: string[];
  readonly stocksMoved: number;
}

/**
 * Aligns (deduplicates) existing products by merging variants of the same base product.
 * Products like "BISMARK da lt.10", "BISMARK da lt.5", "BISMARK da lt.1"
 * are merged into a single product "BISMARK" with separate stock entries.
 */
export class AlignProductsUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(input: AlignProductsInput): Promise<AlignProductsResult> {
    const result: AlignProductsResult = {
      groupsMerged: 0,
      productsMerged: 0,
      stocksMoved: 0,
      productsDeleted: 0,
      errors: [],
      details: [],
    };

    if (input.productIds.length === 0) {
      return result;
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: input.productIds },
        warehouse: { companyId: input.companyId },
      },
      include: { stocks: true },
    });

    if (products.length === 0) {
      result.errors.push('No products found matching the provided IDs and company');
      return result;
    }

    const groups = this.groupByBaseName(products as ProductWithStocks[]);

    for (const [baseName, groupProducts] of groups) {
      if (groupProducts.length <= 1) {
        continue;
      }

      try {
        const detail = await this.mergeGroup(baseName, groupProducts);
        result.details.push(detail);
        result.groupsMerged += 1;
        result.productsMerged += detail.mergedProductIds.length;
        result.stocksMoved += detail.stocksMoved;
        result.productsDeleted += detail.mergedProductIds.length;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to merge group "${baseName}": ${msg}`);
      }
    }

    return result;
  }

  private groupByBaseName(products: ProductWithStocks[]): Map<string, ProductWithStocks[]> {
    const groups = new Map<string, ProductWithStocks[]>();

    for (const product of products) {
      const parsed = parseProductName(product.name);
      const key = parsed.baseName.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.push(product);
      } else {
        groups.set(key, [product]);
      }
    }

    return groups;
  }

  private async mergeGroup(
    baseName: string,
    products: ProductWithStocks[],
  ): Promise<AlignGroupDetail> {
    const officialName = resolveOfficialName(baseName);
    const lookupService = new ProductRegistrationLookupService();
    const lookupResult = lookupService.findProduct(officialName);

    const winner = this.pickWinner(products, officialName);
    const duplicates = products.filter((p) => p.id !== winner.id);
    let totalStocksMoved = 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: winner.id },
        data: {
          name: officialName,
          registrationNumber: lookupResult?.registrationNumber ?? winner.registrationNumber,
        },
      });

      for (const winnerStock of winner.stocks) {
        if (!winnerStock.packagingInfo) {
          const parsed = parseProductName(winner.name);
          if (parsed.packagingInfo) {
            await tx.stock.update({
              where: { id: winnerStock.id },
              data: {
                notes: winnerStock.notes ?? (winner.name !== officialName ? winner.name : null),
                packagingInfo: parsed.packagingInfo,
              },
            });
          }
        }
      }

      for (const duplicate of duplicates) {
        const parsedDup = parseProductName(duplicate.name);

        for (const stock of duplicate.stocks) {
          let quantity = stock.quantity;
          let unit = stock.unitOfMeasureQuantity;
          let pkgInfo = parsedDup.packagingInfo ?? stock.packagingInfo;

          if (isPiecesUnit(unit)) {
            const conversion = convertPiecesToRealUnit(quantity, unit, duplicate.name);
            if (conversion.converted) {
              quantity = conversion.quantity;
              unit = conversion.unitOfMeasure;
              pkgInfo = conversion.packagingInfo;
            }
          }

          await tx.stock.update({
            where: { id: stock.id },
            data: {
              productId: winner.id,
              quantity,
              unitOfMeasureQuantity: unit,
              notes: stock.notes ?? duplicate.name,
              packagingInfo: pkgInfo,
            },
          });
          totalStocksMoved += 1;
        }

        await tx.fieldNote.updateMany({
          where: { productId: duplicate.id },
          data: { productId: winner.id },
        });

        await tx.product.delete({ where: { id: duplicate.id } });
      }
    });

    return {
      baseName: officialName,
      winnerId: winner.id,
      winnerName: officialName,
      mergedProductIds: duplicates.map((d) => d.id),
      stocksMoved: totalStocksMoved,
    };
  }

  private pickWinner(products: ProductWithStocks[], officialName: string): ProductWithStocks {
    const officialMatch = products.find((p) => p.name.toLowerCase() === officialName.toLowerCase());
    if (officialMatch) {
      return officialMatch;
    }
    return [...products].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  }
}
