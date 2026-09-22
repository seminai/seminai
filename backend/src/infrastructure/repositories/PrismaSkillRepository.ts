import { PrismaClient, Prisma } from '@prisma/client';
import { Skill } from '../../domain/entities/Skill';
import { ISkillRepository } from '../../domain/repositories/ISkillRepository';
import { SkillListFiltersDTO } from '../../domain/dtos/skill.dto';

export class PrismaSkillRepository implements ISkillRepository {
  constructor(private prisma: PrismaClient) {}

  async create(skill: Skill): Promise<Skill> {
    const created = await this.prisma.skill.create({
      data: {
        id: skill.id,
        workspaceId: skill.workspaceId,
        name: skill.name,
        slug: skill.slug,
        description: skill.description,
        status: skill.status,
        instructions: skill.instructions,
        sourceRuleId: skill.sourceRuleId,
        isPublic: skill.isPublic,
        isFeatured: skill.isFeatured,
        viewCount: skill.viewCount,
        createdById: skill.createdById,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      },
    });
    return Skill.fromPrisma(created);
  }

  async findById(id: string): Promise<Skill | null> {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    return skill ? Skill.fromPrisma(skill) : null;
  }

  async findBySlug(workspaceId: string, slug: string): Promise<Skill | null> {
    const skill = await this.prisma.skill.findUnique({
      where: { workspaceId_slug: { workspaceId, slug } },
    });
    return skill ? Skill.fromPrisma(skill) : null;
  }

  async findWithFilters(filters: SkillListFiltersDTO): Promise<Skill[]> {
    const where: Prisma.SkillWhereInput = {};
    if (filters.workspaceId) where.workspaceId = filters.workspaceId;
    if (filters.status) where.status = filters.status;
    if (filters.isPublic !== undefined) where.isPublic = filters.isPublic;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const skills = await this.prisma.skill.findMany({ where, orderBy: { createdAt: 'desc' } });
    return skills.map(Skill.fromPrisma);
  }

  async update(id: string, data: Partial<Skill>): Promise<Skill> {
    const updated = await this.prisma.skill.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        status: data.status,
        instructions: data.instructions,
        sourceRuleId: data.sourceRuleId,
        isPublic: data.isPublic,
        isFeatured: data.isFeatured,
      },
    });
    return Skill.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.skill.delete({ where: { id } });
  }
}
