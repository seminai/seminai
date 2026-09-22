import { Prisma, PrismaClient } from '@prisma/client';
import {
  RuleMarketplaceFiltersDTO,
  RuleMarketplaceItemDTO,
  RuleMarketplacePageDTO,
} from '../../domain/dtos/rule.dto';
import { IRuleMarketplaceRepository } from '../../domain/repositories/IRuleMarketplaceRepository';

type MarketplaceRuleRow = Prisma.RuleGetPayload<{
  include: {
    _count: {
      select: {
        companyRules: true;
      };
    };
  };
}>;

interface CreatorInfo {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export class PrismaRuleMarketplaceRepository implements IRuleMarketplaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMarketplaceRules(filters: RuleMarketplaceFiltersDTO): Promise<RuleMarketplacePageDTO> {
    const limit = Math.min(Math.max(filters.limit, 1), 50);
    const page = Math.max(filters.page, 1);
    const creatorIds = await this.resolveCreatorIds(filters.creator);
    if (filters.creator && creatorIds.length === 0) return this.emptyPage(page, limit);
    const where = this.buildWhere(filters, creatorIds);
    const [total, rows] = await Promise.all([
      this.prisma.rule.count({ where }),
      this.prisma.rule.findMany({
        where,
        include: { _count: { select: { companyRules: true } } },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const creators = await this.loadCreators(rows.map((row) => row.createdById));
    return {
      items: rows.map((row) => this.toMarketplaceItem(row, creators)),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    };
  }

  private buildWhere(
    filters: RuleMarketplaceFiltersDTO,
    creatorIds: readonly string[],
  ): Prisma.RuleWhereInput {
    const where: Prisma.RuleWhereInput = { isPublic: true, status: 'ACTIVE' };
    if (filters.category) where.category = filters.category;
    if (filters.region) where.region = { contains: filters.region, mode: 'insensitive' };
    if (creatorIds.length > 0) where.createdById = { in: [...creatorIds] };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { sourceDocument: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private async resolveCreatorIds(creator?: string): Promise<string[]> {
    if (!creator) return [];
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: creator, mode: 'insensitive' } },
          { surname: { contains: creator, mode: 'insensitive' } },
          { email: { contains: creator, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 100,
    });
    return users.map((user) => user.id);
  }

  private async loadCreators(userIds: readonly string[]): Promise<Map<string, CreatorInfo>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, surname: true, email: true },
    });
    return new Map(
      users.map((user) => [
        user.id,
        {
          id: user.id,
          name: `${user.name} ${user.surname ?? ''}`.trim() || user.email,
          email: user.email,
        },
      ]),
    );
  }

  private toMarketplaceItem(
    row: MarketplaceRuleRow,
    creators: ReadonlyMap<string, CreatorInfo>,
  ): RuleMarketplaceItemDTO {
    const creator = creators.get(row.createdById) ?? {
      id: row.createdById,
      name: 'Unknown author',
      email: '',
    };
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      category: row.category,
      status: row.status,
      sourceUrl: row.sourceUrl,
      sourceDocument: row.sourceDocument,
      region: row.region,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      version: row.version,
      isPublic: row.isPublic,
      isTemplate: row.isTemplate,
      isFeatured: row.isFeatured,
      viewCount: row.viewCount,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      pdfFileUrl: row.pdfFileUrl,
      pdfFileName: row.pdfFileName,
      isVectorized: row.isVectorized,
      vectorizedAt: row.vectorizedAt,
      vectorizationError: row.vectorizationError,
      assignmentsCount: row._count.companyRules,
      creator,
    };
  }

  private emptyPage(page: number, limit: number): RuleMarketplacePageDTO {
    return { items: [], total: 0, page, limit, hasNextPage: false };
  }
}
