import { ProductCategory } from '@prisma/client';
import { SyncProductLabelsRequest } from '../../../domain/dtos/product.dto';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerFindSyncCandidates(this: ProductControllerContext, userId: string, filter: SyncProductLabelsRequest): Promise<Array<{ id: string; labelMetadata: unknown }>> {
    const productIdFilter =
      filter.productIds && filter.productIds.length > 0
        ? { in: [...filter.productIds] }
        : undefined;
    return this.prisma!.product.findMany({
      where: {
        id: productIdFilter,
        category: { in: [ProductCategory.PESTICIDE, ProductCategory.FERTILIZER] },
        warehouseId: filter.warehouseId,
        warehouse: {
          companyId: filter.companyId,
          company: { companyUsers: { some: { userId } } },
        },
      },
      select: { id: true, labelMetadata: true },
      take: 500,
    });
  }
