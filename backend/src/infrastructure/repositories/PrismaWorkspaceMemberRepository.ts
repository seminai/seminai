import { PrismaClient } from '@prisma/client';
import { WorkspaceMember } from '../../domain/entities/WorkspaceMember';
import { IWorkspaceMemberRepository } from '../../domain/repositories/IWorkspaceMemberRepository';
import { WorkspaceMemberWithUserDTO } from '../../domain/dtos/workspace.dto';

export class PrismaWorkspaceMemberRepository implements IWorkspaceMemberRepository {
  constructor(private prisma: PrismaClient) {}

  async create(member: WorkspaceMember): Promise<WorkspaceMember> {
    const created = await this.prisma.workspaceMember.create({
      data: {
        id: member.id,
        workspaceId: member.workspaceId,
        userId: member.userId,
        role: member.role,
        canManageRules: member.canManageRules,
        canInviteMembers: member.canInviteMembers,
        joinedAt: member.joinedAt,
        updatedAt: member.updatedAt,
      },
    });
    return WorkspaceMember.fromPrisma(created);
  }

  async findById(id: string): Promise<WorkspaceMember | null> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { id },
    });
    if (!member) return null;
    return WorkspaceMember.fromPrisma(member);
  }

  async findByWorkspaceAndUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember | null> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });
    if (!member) return null;
    return WorkspaceMember.fromPrisma(member);
  }

  async findByWorkspaceId(workspaceId: string): Promise<WorkspaceMember[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
    });
    return members.map(WorkspaceMember.fromPrisma);
  }

  async findByWorkspaceIdWithUsers(workspaceId: string): Promise<WorkspaceMemberWithUserDTO[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
            profilePictureUrl: true,
          },
        },
      },
    });
    return members.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role,
      canManageRules: m.canManageRules,
      canInviteMembers: m.canInviteMembers,
      joinedAt: m.joinedAt,
      user: m.user,
    }));
  }

  async findByUserId(userId: string): Promise<WorkspaceMember[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { userId },
    });
    return members.map(WorkspaceMember.fromPrisma);
  }

  async update(id: string, data: Partial<WorkspaceMember>): Promise<WorkspaceMember> {
    const updated = await this.prisma.workspaceMember.update({
      where: { id },
      data: {
        role: data.role,
        canManageRules: data.canManageRules,
        canInviteMembers: data.canInviteMembers,
      },
    });
    return WorkspaceMember.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workspaceMember.delete({
      where: { id },
    });
  }

  async deleteByWorkspaceAndUser(workspaceId: string, userId: string): Promise<void> {
    await this.prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
    });
  }
}
