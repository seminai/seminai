import { PrismaClient } from '@prisma/client';
import { CompanyOnWorkspace } from '../../domain/entities/CompanyOnWorkspace';
import {
  ICompanyOnWorkspaceRepository,
  WorkspaceCompanyAssignmentDTO,
} from '../../domain/repositories/ICompanyOnWorkspaceRepository';

export class PrismaCompanyOnWorkspaceRepository implements ICompanyOnWorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createMany(assignments: CompanyOnWorkspace[]): Promise<void> {
    if (assignments.length === 0) return;
    await this.prisma.companyOnWorkspace.createMany({
      data: assignments.map((assignment) => ({
        id: assignment.id,
        workspaceId: assignment.workspaceId,
        companyId: assignment.companyId,
        assignedById: assignment.assignedById,
        assignedAt: assignment.assignedAt,
      })),
      skipDuplicates: true,
    });
  }

  async findCompanyIdsByWorkspaceId(workspaceId: string): Promise<string[]> {
    const rows = await this.prisma.companyOnWorkspace.findMany({
      where: { workspaceId },
      select: { companyId: true },
      orderBy: { assignedAt: 'asc' },
    });
    return rows.map((row) => row.companyId);
  }

  async findAssignmentsWithCompanies(
    workspaceId: string,
  ): Promise<WorkspaceCompanyAssignmentDTO[]> {
    const rows = await this.prisma.companyOnWorkspace.findMany({
      where: { workspaceId },
      include: {
        company: {
          select: { id: true, name: true, kind: true },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });
    return rows.map((row) => ({
      companyId: row.company.id,
      companyName: row.company.name,
      companyKind: row.company.kind,
      assignedAt: row.assignedAt,
    }));
  }

  async replaceAssignments(
    workspaceId: string,
    companyIds: readonly string[],
    assignedById: string,
  ): Promise<void> {
    const uniqueCompanyIds = [...new Set(companyIds)];
    await this.prisma.$transaction(async (tx) => {
      await tx.companyOnWorkspace.deleteMany({ where: { workspaceId } });
      if (uniqueCompanyIds.length === 0) return;
      await tx.companyOnWorkspace.createMany({
        data: uniqueCompanyIds.map((companyId) => ({
          workspaceId,
          companyId,
          assignedById,
        })),
      });
    });
  }

  async assignCompany(
    workspaceId: string,
    companyId: string,
    assignedById: string,
  ): Promise<CompanyOnWorkspace> {
    const created = await this.prisma.companyOnWorkspace.upsert({
      where: {
        workspaceId_companyId: { workspaceId, companyId },
      },
      create: {
        workspaceId,
        companyId,
        assignedById,
      },
      update: {},
    });
    return CompanyOnWorkspace.fromPrisma(created);
  }
}
