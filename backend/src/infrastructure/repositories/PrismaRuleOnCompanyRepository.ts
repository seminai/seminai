import { PrismaClient, Prisma, WorkspaceKind } from '@prisma/client';
import { RuleOnCompany } from '../../domain/entities/RuleOnCompany';
import { IRuleOnCompanyRepository } from '../../domain/repositories/IRuleOnCompanyRepository';

export class PrismaRuleOnCompanyRepository implements IRuleOnCompanyRepository {
  constructor(private prisma: PrismaClient) {}

  async create(ruleOnCompany: RuleOnCompany): Promise<RuleOnCompany> {
    const created = await this.prisma.ruleOnCompany.create({
      data: {
        id: ruleOnCompany.id,
        ruleId: ruleOnCompany.ruleId,
        companyId: ruleOnCompany.companyId,
        isActive: ruleOnCompany.isActive,
        priority: ruleOnCompany.priority,
        overrides:
          ruleOnCompany.overrides === null
            ? Prisma.JsonNull
            : (ruleOnCompany.overrides as Prisma.InputJsonValue),
        notes: ruleOnCompany.notes,
        assignedAt: ruleOnCompany.assignedAt,
        assignedById: ruleOnCompany.assignedById,
      },
    });
    return RuleOnCompany.fromPrisma(created);
  }

  async findById(id: string): Promise<RuleOnCompany | null> {
    const ruleOnCompany = await this.prisma.ruleOnCompany.findUnique({
      where: { id },
    });
    if (!ruleOnCompany) return null;
    return RuleOnCompany.fromPrisma(ruleOnCompany);
  }

  async findByRuleAndCompany(ruleId: string, companyId: string): Promise<RuleOnCompany | null> {
    const ruleOnCompany = await this.prisma.ruleOnCompany.findUnique({
      where: {
        ruleId_companyId: { ruleId, companyId },
      },
    });
    if (!ruleOnCompany) return null;
    return RuleOnCompany.fromPrisma(ruleOnCompany);
  }

  async findByRuleId(ruleId: string): Promise<RuleOnCompany[]> {
    const assignments = await this.prisma.ruleOnCompany.findMany({
      where: { ruleId },
      orderBy: { priority: 'asc' },
    });
    return assignments.map(RuleOnCompany.fromPrisma);
  }

  async findByCompanyId(companyId: string): Promise<RuleOnCompany[]> {
    const assignments = await this.prisma.ruleOnCompany.findMany({
      where: { companyId },
      orderBy: { priority: 'asc' },
    });
    return assignments.map(RuleOnCompany.fromPrisma);
  }

  async findActiveByCompanyId(companyId: string): Promise<RuleOnCompany[]> {
    const assignments = await this.prisma.ruleOnCompany.findMany({
      where: { companyId, isActive: true },
      orderBy: { priority: 'asc' },
    });
    return assignments.map(RuleOnCompany.fromPrisma);
  }

  async update(id: string, data: Partial<RuleOnCompany>): Promise<RuleOnCompany> {
    const updated = await this.prisma.ruleOnCompany.update({
      where: { id },
      data: {
        isActive: data.isActive,
        priority: data.priority,
        overrides:
          data.overrides === null
            ? Prisma.JsonNull
            : data.overrides === undefined
              ? undefined
              : (data.overrides as Prisma.InputJsonValue),
        notes: data.notes,
      },
    });
    return RuleOnCompany.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.ruleOnCompany.delete({
      where: { id },
    });
  }

  async deleteByRuleAndCompany(ruleId: string, companyId: string): Promise<void> {
    await this.prisma.ruleOnCompany.delete({
      where: {
        ruleId_companyId: { ruleId, companyId },
      },
    });
  }

  async findDistinctWorkspaceKindsByCompanyId(companyId: string): Promise<WorkspaceKind[]> {
    const assignments = await this.prisma.ruleOnCompany.findMany({
      where: { companyId },
      select: {
        rule: {
          select: {
            workspace: {
              select: { kind: true },
            },
          },
        },
      },
    });

    const kinds = new Set<WorkspaceKind>();
    for (const assignment of assignments) {
      kinds.add(assignment.rule.workspace.kind);
    }
    return [...kinds];
  }
}
