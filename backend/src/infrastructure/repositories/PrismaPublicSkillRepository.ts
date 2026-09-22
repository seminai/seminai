import { Prisma, PrismaClient } from '@prisma/client';
import {
  PublicSkillDetailDTO,
  PublicSkillFiltersDTO,
  PublicSkillListItemDTO,
  PublicSkillListPageDTO,
} from '../../domain/dtos/public-skill.dto';
import { IPublicSkillRepository } from '../../domain/repositories/IPublicSkillRepository';

type PublicSkillRow = Prisma.SkillGetPayload<{
  include: { sourceRule: { select: { name: true; slug: true } } };
}>;

const PUBLIC_SKILL_WHERE = { isPublic: true, status: 'ACTIVE' } as const;

export class PrismaPublicSkillRepository implements IPublicSkillRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPublicSkills(filters: PublicSkillFiltersDTO): Promise<PublicSkillListPageDTO> {
    const limit = Math.min(Math.max(filters.limit, 1), 50);
    const page = Math.max(filters.page, 1);
    const where = this.buildWhere(filters);
    const [total, rows] = await Promise.all([
      this.prisma.skill.count({ where }),
      this.prisma.skill.findMany({
        where,
        include: { sourceRule: { select: { name: true, slug: true } } },
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

  async findPublicSkillBySlug(slug: string): Promise<PublicSkillDetailDTO | null> {
    const row = await this.prisma.skill.findFirst({
      where: { ...PUBLIC_SKILL_WHERE, slug },
      include: { sourceRule: { select: { name: true, slug: true } } },
      orderBy: [{ updatedAt: 'desc' }],
    });
    if (!row) return null;
    const creators = await this.loadCreatorNames([row.createdById]);
    return { ...this.toListItem(row, creators), instructions: row.instructions };
  }

  async incrementViewCount(skillId: string): Promise<void> {
    await this.prisma.skill.update({
      where: { id: skillId },
      data: { viewCount: { increment: 1 } },
    });
  }

  private buildWhere(filters: PublicSkillFiltersDTO): Prisma.SkillWhereInput {
    const where: Prisma.SkillWhereInput = { ...PUBLIC_SKILL_WHERE };
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
    row: PublicSkillRow,
    creators: ReadonlyMap<string, string>,
  ): PublicSkillListItemDTO {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      sourceRuleSlug: row.sourceRule?.slug ?? null,
      sourceRuleName: row.sourceRule?.name ?? null,
      isFeatured: row.isFeatured,
      viewCount: row.viewCount,
      creatorName: creators.get(row.createdById) ?? 'Community Seminai',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
