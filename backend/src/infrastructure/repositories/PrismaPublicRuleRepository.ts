import { Prisma, PrismaClient } from '@prisma/client';
import {
  PublicRuleCategoryFacetDTO,
  PublicRuleDetailDTO,
  PublicRuleFiltersDTO,
  PublicRuleListItemDTO,
  PublicRuleListPageDTO,
} from '../../domain/dtos/public-rule.dto';
import { IPublicRuleRepository } from '../../domain/repositories/IPublicRuleRepository';

type PublicRuleRow = Prisma.RuleGetPayload<{
  include: {
    _count: {
      select: {
        companyRules: true;
      };
    };
  };
}>;

const PUBLIC_RULE_WHERE = { isPublic: true, status: 'ACTIVE' } as const;

export class PrismaPublicRuleRepository implements IPublicRuleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPublicRules(filters: PublicRuleFiltersDTO): Promise<PublicRuleListPageDTO> {
    const limit = Math.min(Math.max(filters.limit, 1), 50);
    const page = Math.max(filters.page, 1);
    const where = this.buildWhere(filters);
    const [total, rows] = await Promise.all([
      this.prisma.rule.count({ where }),
      this.prisma.rule.findMany({
        where,
        include: { _count: { select: { companyRules: true } } },
        orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const creators = await this.loadCreatorNames(rows.map((row) => row.createdById));
    return {
      items: rows.map((row) => this.toListItem(row, creators)),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    };
  }

  async findPublicRuleBySlug(slug: string): Promise<PublicRuleDetailDTO | null> {
    const row = await this.prisma.rule.findFirst({
      where: { ...PUBLIC_RULE_WHERE, slug },
      include: { _count: { select: { companyRules: true } } },
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (!row) return null;
    const creators = await this.loadCreatorNames([row.createdById]);
    return {
      ...this.toListItem(row, creators),
      sourceUrl: row.sourceUrl,
      sourceDocument: row.sourceDocument,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      isTemplate: row.isTemplate,
    };
  }

  async findCategoryFacets(): Promise<PublicRuleCategoryFacetDTO[]> {
    const grouped = await this.prisma.rule.groupBy({
      by: ['category'],
      where: PUBLIC_RULE_WHERE,
      _count: { _all: true },
    });
    return grouped.map((group) => ({ category: group.category, count: group._count._all }));
  }

  async incrementViewCount(ruleId: string): Promise<void> {
    await this.prisma.rule.update({
      where: { id: ruleId },
      data: { viewCount: { increment: 1 } },
    });
  }

  private buildWhere(filters: PublicRuleFiltersDTO): Prisma.RuleWhereInput {
    const where: Prisma.RuleWhereInput = { ...PUBLIC_RULE_WHERE };
    if (filters.category) where.category = filters.category;
    if (filters.region) where.region = { contains: filters.region, mode: 'insensitive' };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private async loadCreatorNames(userIds: readonly string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true, surname: true },
    });
    return new Map(users.map((user) => [user.id, `${user.name} ${user.surname ?? ''}`.trim()]));
  }

  private toListItem(
    row: PublicRuleRow,
    creators: ReadonlyMap<string, string>,
  ): PublicRuleListItemDTO {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      region: row.region,
      version: row.version,
      isFeatured: row.isFeatured,
      viewCount: row.viewCount,
      assignmentsCount: row._count.companyRules,
      creatorName: creators.get(row.createdById) ?? 'Community Seminai',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
