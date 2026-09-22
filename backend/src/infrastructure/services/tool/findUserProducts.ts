import { PrismaClient, ProductCategory } from '@prisma/client';

/**
 * Stock movement information.
 */
export interface StockMovement {
  quantity: number;
  unitOfMeasureQuantity: string;
  type: string;
  createdAt: Date;
}

/**
 * Product information returned by the search.
 */
export interface UserProductInfo {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: ProductCategory;
  type: string;
  description: string | null;
  registrationNumber: string | null;
  warehouseId: string;
  warehouseName: string;
  companyId: string;
  recentStocks: StockMovement[];
  totalAvailableQuantity?: number;
}

/**
 * Finds all products accessible by the user through their companies' warehouses.
 * Optionally filters by search term, category, and/or companyId.
 */
export async function findUserProducts(params: {
  userId: string;
  searchTerm?: string;
  category?: ProductCategory;
  companyId?: string;
  prisma: PrismaClient;
}): Promise<UserProductInfo[]> {
  const { userId, searchTerm, category, companyId, prisma } = params;

  try {
    // Find all products in warehouses of companies the user has access to
    const products = await prisma.product.findMany({
      where: {
        warehouse: {
          ...(companyId ? { companyId } : {}),
          company: {
            companyUsers: {
              some: { userId },
            },
          },
        },
        ...(searchTerm && {
          name: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        }),
        ...(category && { category }),
      },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            companyId: true,
          },
        },
        stocks: {
          where: {
            OR: [{ jobId: null }, { job: { isVerified: true } }],
          },
          orderBy: { createdAt: 'desc' },
          select: {
            quantity: true,
            unitOfMeasureQuantity: true,
            type: true,
            createdAt: true,
          },
        },
      },
    });

    // Format results and calculate available quantity
    const results: UserProductInfo[] = products.map((product) => {
      // Calculate total available quantity from stock movements
      // Assuming 'IN' type adds stock and 'OUT' type removes it
      // Use Math.abs so the stock type determines direction,
      // regardless of whether the DB stores OUT as negative or positive.
      const totalAvailableQuantity = product.stocks.reduce((total, stock) => {
        if (stock.type === 'IN' || stock.type === 'CARICO') {
          return total + Math.abs(stock.quantity);
        } else if (stock.type === 'OUT' || stock.type === 'SCARICO') {
          return total - Math.abs(stock.quantity);
        }
        return total;
      }, 0);

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        category: product.category,
        type: product.type,
        description: product.description,
        registrationNumber: product.registrationNumber,
        warehouseId: product.warehouse.id,
        warehouseName: product.warehouse.name,
        companyId: product.warehouse.companyId,
        recentStocks: product.stocks.slice(0, 5).map((stock) => ({
          quantity: stock.quantity,
          unitOfMeasureQuantity: stock.unitOfMeasureQuantity,
          type: stock.type,
          createdAt: stock.createdAt,
        })),
        totalAvailableQuantity,
      };
    });

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find user products: ${errorMessage}`);
  }
}
