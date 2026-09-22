import { PrismaClient, Prisma } from '@prisma/client';
import { Rule } from '../../domain/entities/Rule';
import { IRuleRepository } from '../../domain/repositories/IRuleRepository';
import { RuleListFiltersDTO, RuleWithAssignmentsDTO } from '../../domain/dtos/rule.dto';

export class PrismaRuleRepository implements IRuleRepository {
  constructor(private prisma: PrismaClient) {}

  async create(rule: Rule): Promise<Rule> {
    const created = await this.prisma.rule.create({
      data: {
        id: rule.id,
        workspaceId: rule.workspaceId,
        name: rule.name,
        slug: rule.slug,
        description: rule.description,
        category: rule.category,
        status: rule.status,
        content: rule.content as Prisma.InputJsonValue,
        sourceUrl: rule.sourceUrl,
        sourceDocument: rule.sourceDocument,
        region: rule.region,
        validFrom: rule.validFrom,
        validUntil: rule.validUntil,
        version: rule.version,
        isPublic: rule.isPublic,
        isTemplate: rule.isTemplate,
        createdById: rule.createdById,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
        pdfFileUrl: rule.pdfFileUrl,
        pdfFileName: rule.pdfFileName,
        pdfFileHash: rule.pdfFileHash,
        qdrantCollection: rule.qdrantCollection,
        isVectorized: rule.isVectorized,
        vectorizedAt: rule.vectorizedAt,
        vectorizationError: rule.vectorizationError,
      },
    });
    return Rule.fromPrisma(created);
  }

  async findById(id: string): Promise<Rule | null> {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
    });
    if (!rule) return null;
    return Rule.fromPrisma(rule);
  }

  async findBySlug(workspaceId: string, slug: string): Promise<Rule | null> {
    const rule = await this.prisma.rule.findUnique({
      where: {
        workspaceId_slug: { workspaceId, slug },
      },
    });
    if (!rule) return null;
    return Rule.fromPrisma(rule);
  }

  async findByWorkspaceId(workspaceId: string): Promise<Rule[]> {
    const rules = await this.prisma.rule.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rules.map(Rule.fromPrisma);
  }

  async findWithFilters(filters: RuleListFiltersDTO): Promise<Rule[]> {
    const where: Prisma.RuleWhereInput = {};
    if (filters.workspaceId) {
      where.workspaceId = filters.workspaceId;
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.region) {
      where.region = filters.region;
    }
    if (filters.isPublic !== undefined) {
      where.isPublic = filters.isPublic;
    }
    if (filters.isTemplate !== undefined) {
      where.isTemplate = filters.isTemplate;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const rules = await this.prisma.rule.findMany({
      where,
      include: {
        _count: {
          select: {
            companyRules: true,
            cropRules: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rules.map(Rule.fromPrisma);
  }

  async findWithFiltersAndCounts(filters: RuleListFiltersDTO): Promise<RuleWithAssignmentsDTO[]> {
    const where: Prisma.RuleWhereInput = {};
    if (filters.workspaceId) {
      where.workspaceId = filters.workspaceId;
    }
    if (filters.category) {
      where.category = filters.category;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.region) {
      where.region = filters.region;
    }
    if (filters.isPublic !== undefined) {
      where.isPublic = filters.isPublic;
    }
    if (filters.isTemplate !== undefined) {
      where.isTemplate = filters.isTemplate;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const rules = await this.prisma.rule.findMany({
      where,
      include: {
        _count: {
          select: {
            companyRules: true,
            cropRules: true,
          },
        },
        companyRules: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            priority: 'asc',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rules.map((rule) => ({
      id: rule.id,
      workspaceId: rule.workspaceId,
      name: rule.name,
      slug: rule.slug,
      description: rule.description,
      category: rule.category,
      status: rule.status,
      content: rule.content,
      sourceUrl: rule.sourceUrl,
      sourceDocument: rule.sourceDocument,
      region: rule.region,
      validFrom: rule.validFrom,
      validUntil: rule.validUntil,
      version: rule.version,
      isPublic: rule.isPublic,
      isTemplate: rule.isTemplate,
      createdById: rule.createdById,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      pdfFileUrl: rule.pdfFileUrl,
      pdfFileName: rule.pdfFileName,
      isVectorized: rule.isVectorized,
      vectorizedAt: rule.vectorizedAt,
      vectorizationError: rule.vectorizationError,
      companiesCount: rule._count.companyRules,
      cropsCount: rule._count.cropRules,
      companies: rule.companyRules.map((assignment) => ({
        id: assignment.company.id,
        name: assignment.company.name,
      })),
    }));
  }

  async findWithCounts(id: string): Promise<RuleWithAssignmentsDTO | null> {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            companyRules: true,
            cropRules: true,
          },
        },
        companyRules: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            priority: 'asc',
          },
        },
      },
    });
    if (!rule) return null;
    return {
      id: rule.id,
      workspaceId: rule.workspaceId,
      name: rule.name,
      slug: rule.slug,
      description: rule.description,
      category: rule.category,
      status: rule.status,
      content: rule.content,
      sourceUrl: rule.sourceUrl,
      sourceDocument: rule.sourceDocument,
      region: rule.region,
      validFrom: rule.validFrom,
      validUntil: rule.validUntil,
      version: rule.version,
      isPublic: rule.isPublic,
      isTemplate: rule.isTemplate,
      createdById: rule.createdById,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      pdfFileUrl: rule.pdfFileUrl,
      pdfFileName: rule.pdfFileName,
      isVectorized: rule.isVectorized,
      vectorizedAt: rule.vectorizedAt,
      vectorizationError: rule.vectorizationError,
      companiesCount: rule._count.companyRules,
      cropsCount: rule._count.cropRules,
      companies: rule.companyRules.map((assignment) => ({
        id: assignment.company.id,
        name: assignment.company.name,
      })),
    };
  }

  async findPublicRules(): Promise<Rule[]> {
    const rules = await this.prisma.rule.findMany({
      where: { isPublic: true, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    return rules.map(Rule.fromPrisma);
  }

  async findTemplates(): Promise<Rule[]> {
    const rules = await this.prisma.rule.findMany({
      where: { isTemplate: true },
      orderBy: { createdAt: 'desc' },
    });
    return rules.map(Rule.fromPrisma);
  }

  async update(id: string, data: Partial<Rule>): Promise<Rule> {
    const updated = await this.prisma.rule.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        category: data.category,
        status: data.status,
        content: data.content as Prisma.InputJsonValue | undefined,
        sourceUrl: data.sourceUrl,
        sourceDocument: data.sourceDocument,
        region: data.region,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        version: data.version,
        isPublic: data.isPublic,
        isTemplate: data.isTemplate,
        pdfFileUrl: data.pdfFileUrl,
        pdfFileName: data.pdfFileName,
        pdfFileHash: data.pdfFileHash,
        qdrantCollection: data.qdrantCollection,
        isVectorized: data.isVectorized,
        vectorizedAt: data.vectorizedAt,
        vectorizationError: data.vectorizationError,
      },
    });
    return Rule.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.rule.delete({
      where: { id },
    });
  }

  async countByWorkspaceId(workspaceId: string): Promise<number> {
    return this.prisma.rule.count({
      where: { workspaceId },
    });
  }

  async findVectorizedByIds(ruleIds: string[]): Promise<Rule[]> {
    const rules = await this.prisma.rule.findMany({
      where: {
        id: { in: ruleIds },
        isVectorized: true,
        status: 'ACTIVE',
      },
    });
    return rules.map(Rule.fromPrisma);
  }

  async findVectorizedByWorkspaceId(
    workspaceId: string,
    categories?: ReadonlyArray<import('@prisma/client').RuleCategory>,
  ): Promise<Rule[]> {
    const where: Prisma.RuleWhereInput = {
      workspaceId,
      isVectorized: true,
      status: 'ACTIVE',
    };
    if (categories && categories.length > 0) {
      where.category = { in: [...categories] };
    }
    const rules = await this.prisma.rule.findMany({ where });
    return rules.map(Rule.fromPrisma);
  }
}
