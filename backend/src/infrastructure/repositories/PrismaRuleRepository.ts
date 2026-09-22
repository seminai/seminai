import { PrismaClient, Prisma } from '@prisma/client';
import { Rule } from '../../domain/entities/Rule';
import { IRuleRepository } from '../../domain/repositories/IRuleRepository';
import { RuleListFiltersDTO, RuleWithAssignmentsDTO } from '../../domain/dtos/rule.dto';
import {
  buildRuleWhere,
  RULE_WITH_ASSIGNMENTS_INCLUDE,
  toRuleWithAssignments,
} from './prisma-rule-mappers';

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
    const rules = await this.prisma.rule.findMany({
      where: buildRuleWhere(filters),
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
    const rules = await this.prisma.rule.findMany({
      where: buildRuleWhere(filters),
      include: RULE_WITH_ASSIGNMENTS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rules.map(toRuleWithAssignments);
  }

  async findWithCounts(id: string): Promise<RuleWithAssignmentsDTO | null> {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      include: RULE_WITH_ASSIGNMENTS_INCLUDE,
    });
    if (!rule) return null;
    return toRuleWithAssignments(rule);
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
