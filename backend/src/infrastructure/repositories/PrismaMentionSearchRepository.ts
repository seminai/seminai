import { PrismaClient } from '@prisma/client';
import type { MentionEntityType, MentionSearchResultItem } from '../../domain/dtos/mention.dto';
import type {
  IMentionSearchRepository,
  MentionSearchParams,
} from '../../domain/repositories/IMentionSearchRepository';

const DEFAULT_LIMIT_PER_TYPE = 5;

/**
 * Prisma implementation of unified mention search across entity types.
 * Runs parallel queries filtered by user ownership via join chains.
 */
export class PrismaMentionSearchRepository implements IMentionSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async search(params: MentionSearchParams): Promise<MentionSearchResultItem[]> {
    const {
      userId,
      query,
      types = ['company', 'product', 'field', 'production_unit', 'stock', 'file'],
      limit = DEFAULT_LIMIT_PER_TYPE,
    } = params;

    const searches: Array<Promise<MentionSearchResultItem[]>> = [];

    for (const type of types) {
      searches.push(this.searchByType({ userId, query, type, limit }));
    }

    const results = await Promise.all(searches);
    return results.flat();
  }

  private async searchByType(params: {
    userId: string;
    query: string;
    type: MentionEntityType;
    limit: number;
  }): Promise<MentionSearchResultItem[]> {
    const { userId, query, type, limit } = params;

    switch (type) {
      case 'company':
        return this.searchCompanies({ userId, query, limit });
      case 'product':
        return this.searchProducts({ userId, query, limit });
      case 'field':
        return this.searchFields({ userId, query, limit });
      case 'production_unit':
        return this.searchProductionUnits({ userId, query, limit });
      case 'stock':
        return this.searchStocks({ userId, query, limit });
      case 'file':
        return this.searchFiles({ userId, query, limit });
      default:
        return [];
    }
  }

  private async searchCompanies(params: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<MentionSearchResultItem[]> {
    const rows = await this.prisma.company.findMany({
      where: {
        companyUsers: { some: { userId: params.userId } },
        name: { contains: params.query, mode: 'insensitive' },
      },
      select: { id: true, name: true, vatNumber: true, city: true },
      take: params.limit,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: 'company' as const,
      label: r.name,
      subtitle: [r.vatNumber, r.city].filter(Boolean).join(' — '),
    }));
  }

  private async searchProducts(params: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<MentionSearchResultItem[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        warehouse: { company: { companyUsers: { some: { userId: params.userId } } } },
        name: { contains: params.query, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        category: true,
        warehouse: { select: { company: { select: { name: true } } } },
      },
      take: params.limit,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: 'product' as const,
      label: r.name,
      subtitle: [r.category, r.warehouse.company.name].filter(Boolean).join(' — '),
    }));
  }

  private async searchFields(params: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<MentionSearchResultItem[]> {
    const rows = await this.prisma.field.findMany({
      where: {
        company: { companyUsers: { some: { userId: params.userId } } },
        name: { contains: params.query, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        sauHa: true,
        city: true,
        company: { select: { name: true } },
      },
      take: params.limit,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: 'field' as const,
      label: r.name,
      subtitle: [r.company?.name, r.sauHa ? `${r.sauHa} ha` : null, r.city]
        .filter(Boolean)
        .join(' — '),
    }));
  }

  private async searchProductionUnits(params: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<MentionSearchResultItem[]> {
    const rows = await this.prisma.productionUnit.findMany({
      where: {
        productionUnitsOnFields: {
          some: {
            field: { company: { companyUsers: { some: { userId: params.userId } } } },
          },
        },
        name: { contains: params.query, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        areaHa: true,
        cycles: {
          select: { cropName: true },
          take: 1,
          orderBy: { seasonYear: 'desc' },
        },
        productionUnitsOnFields: {
          select: { field: { select: { company: { select: { name: true } } } } },
          take: 1,
        },
      },
      take: params.limit,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => {
      const cropName = r.cycles[0]?.cropName;
      const companyName = r.productionUnitsOnFields[0]?.field.company?.name;
      return {
        id: r.id,
        type: 'production_unit' as const,
        label: r.name,
        subtitle: [cropName, companyName, r.areaHa ? `${r.areaHa} ha` : null]
          .filter(Boolean)
          .join(' — '),
      };
    });
  }

  private async searchStocks(params: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<MentionSearchResultItem[]> {
    const rows = await this.prisma.stock.findMany({
      where: {
        product: {
          warehouse: { company: { companyUsers: { some: { userId: params.userId } } } },
          name: { contains: params.query, mode: 'insensitive' },
        },
      },
      select: {
        id: true,
        quantity: true,
        unitOfMeasureQuantity: true,
        product: {
          select: {
            name: true,
            warehouse: { select: { company: { select: { name: true } } } },
          },
        },
      },
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: 'stock' as const,
      label: r.product.name,
      subtitle: `${r.quantity} ${r.unitOfMeasureQuantity} — ${r.product.warehouse.company.name}`,
    }));
  }

  private async searchFiles(params: {
    userId: string;
    query: string;
    limit: number;
  }): Promise<MentionSearchResultItem[]> {
    const rows = await this.prisma.file.findMany({
      where: {
        company: { companyUsers: { some: { userId: params.userId } } },
        name: { contains: params.query, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        type: true,
        company: { select: { name: true } },
      },
      take: params.limit,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: 'file' as const,
      label: r.name,
      subtitle: [r.type, r.company.name].filter(Boolean).join(' — '),
    }));
  }
}
