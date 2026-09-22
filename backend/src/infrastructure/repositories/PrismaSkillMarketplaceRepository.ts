import { Prisma, PrismaClient } from '@prisma/client';
import {
  SkillMarketplaceFiltersDTO,
  SkillMarketplaceItemDTO,
  SkillMarketplacePageDTO,
} from '../../domain/dtos/skill.dto';
import { ISkillMarketplaceRepository } from '../../domain/repositories/ISkillMarketplaceRepository';

type MarketplaceSkillRow = Prisma.SkillGetPayload<{
  include: { sourceRule: { select: { name: true } } };
}>;

interface CreatorInfo {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export class PrismaSkillMarketplaceRepository implements ISkillMarketplaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMarketplaceSkills(
    filters: SkillMarketplaceFiltersDTO,
  ): Promise<SkillMarketplacePageDTO> {
    const limit = Math.min(Math.max(filters.limit, 1), 50);
    const page = Math.max(filters.page, 1);
    const creatorIds = await this.resolveCreatorIds(filters.creator);
    if (filters.creator && creatorIds.length === 0) return this.emptyPage(page, limit);
    const where = this.buildWhere(filters, creatorIds);
    const [total, rows] = await Promise.all([
      this.prisma.skill.count({ where }),
      this.prisma.skill.findMany({
        where,
        include: { sourceRule: { select: { name: true } } },
        orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
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
    filters: SkillMarketplaceFiltersDTO,
    creatorIds: readonly string[],
  ): Prisma.SkillWhereInput {
    const where: Prisma.SkillWhereInput = { isPublic: true, status: 'ACTIVE' };
    if (creatorIds.length > 0) where.createdById = { in: [...creatorIds] };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
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
    row: MarketplaceSkillRow,
    creators: ReadonlyMap<string, CreatorInfo>,
  ): SkillMarketplaceItemDTO {
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
      status: row.status,
      instructions: row.instructions,
      sourceRuleId: row.sourceRuleId,
      sourceRuleName: row.sourceRule?.name ?? null,
      isPublic: row.isPublic,
      isFeatured: row.isFeatured,
      viewCount: row.viewCount,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      creator,
    };
  }

  private emptyPage(page: number, limit: number): SkillMarketplacePageDTO {
    return { items: [], total: 0, page, limit, hasNextPage: false };
  }
}
