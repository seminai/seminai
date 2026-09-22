import { PrismaClient } from '@prisma/client';
import { Workspace } from '../../domain/entities/Workspace';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { WorkspaceWithMembersDTO } from '../../domain/dtos/workspace.dto';

export class PrismaWorkspaceRepository implements IWorkspaceRepository {
  constructor(private prisma: PrismaClient) {}

  async create(workspace: Workspace): Promise<Workspace> {
    const created = await this.prisma.workspace.create({
      data: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
        logoUrl: workspace.logoUrl,
        iconUrl: workspace.iconUrl,
        primaryColor: workspace.primaryColor,
        secondaryColor: workspace.secondaryColor,
        accentColor: workspace.accentColor,
        customCss: workspace.customCss,
        kind: workspace.kind,
        plan: workspace.plan,
        isActive: workspace.isActive,
        maxMembers: workspace.maxMembers,
        maxRules: workspace.maxRules,
        enabledModules: workspace.enabledModules,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      },
    });
    return Workspace.fromPrisma(created);
  }

  async findById(id: string): Promise<Workspace | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });
    if (!workspace) return null;
    return Workspace.fromPrisma(workspace);
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { slug },
    });
    if (!workspace) return null;
    return Workspace.fromPrisma(workspace);
  }

  async findByUserId(userId: string): Promise<Workspace[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
    });
    return members.map((m) => Workspace.fromPrisma(m.workspace));
  }

  async findWithCounts(id: string): Promise<WorkspaceWithMembersDTO | null> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            members: true,
            rules: true,
          },
        },
      },
    });
    if (!workspace) return null;
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      logoUrl: workspace.logoUrl,
      iconUrl: workspace.iconUrl,
      primaryColor: workspace.primaryColor,
      secondaryColor: workspace.secondaryColor,
      accentColor: workspace.accentColor,
      plan: workspace.plan,
      kind: workspace.kind,
      isActive: workspace.isActive,
      maxMembers: workspace.maxMembers,
      maxRules: workspace.maxRules,
      enabledModules: workspace.enabledModules,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      membersCount: workspace._count.members,
      rulesCount: workspace._count.rules,
    };
  }

  async update(id: string, data: Partial<Workspace>): Promise<Workspace> {
    const updated = await this.prisma.workspace.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        logoUrl: data.logoUrl,
        iconUrl: data.iconUrl,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        accentColor: data.accentColor,
        customCss: data.customCss,
        plan: data.plan,
        isActive: data.isActive,
        maxMembers: data.maxMembers,
        maxRules: data.maxRules,
        enabledModules: data.enabledModules,
      },
    });
    return Workspace.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workspace.delete({
      where: { id },
    });
  }

  async countMembers(workspaceId: string): Promise<number> {
    return this.prisma.workspaceMember.count({
      where: { workspaceId },
    });
  }

  async countRules(workspaceId: string): Promise<number> {
    return this.prisma.rule.count({
      where: { workspaceId },
    });
  }
}
