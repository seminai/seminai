import { PrismaClient } from '@prisma/client';
import { WorkspaceInvitation } from '../../domain/entities/WorkspaceInvitation';
import { IWorkspaceInvitationRepository } from '../../domain/repositories/IWorkspaceInvitationRepository';

export class PrismaWorkspaceInvitationRepository implements IWorkspaceInvitationRepository {
  constructor(private prisma: PrismaClient) {}

  async create(invitation: WorkspaceInvitation): Promise<WorkspaceInvitation> {
    const created = await this.prisma.workspaceInvitation.create({
      data: {
        id: invitation.id,
        workspaceId: invitation.workspaceId,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        invitedById: invitation.invitedById,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        createdAt: invitation.createdAt,
      },
    });
    return WorkspaceInvitation.fromPrisma(created);
  }

  async findById(id: string): Promise<WorkspaceInvitation | null> {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { id },
    });
    if (!invitation) return null;
    return WorkspaceInvitation.fromPrisma(invitation);
  }

  async findByToken(token: string): Promise<WorkspaceInvitation | null> {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { token },
    });
    if (!invitation) return null;
    return WorkspaceInvitation.fromPrisma(invitation);
  }

  async findByWorkspaceAndEmail(
    workspaceId: string,
    email: string,
  ): Promise<WorkspaceInvitation | null> {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: {
        workspaceId_email: { workspaceId, email: email.toLowerCase() },
      },
    });
    if (!invitation) return null;
    return WorkspaceInvitation.fromPrisma(invitation);
  }

  async findByWorkspaceId(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const invitations = await this.prisma.workspaceInvitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(WorkspaceInvitation.fromPrisma);
  }

  async findPendingByWorkspaceId(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const now = new Date();
    const invitations = await this.prisma.workspaceInvitation.findMany({
      where: {
        workspaceId,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(WorkspaceInvitation.fromPrisma);
  }

  async findPendingByEmail(email: string): Promise<WorkspaceInvitation[]> {
    const now = new Date();
    const invitations = await this.prisma.workspaceInvitation.findMany({
      where: {
        email: email.toLowerCase(),
        acceptedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        workspace: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(WorkspaceInvitation.fromPrisma);
  }

  async update(
    id: string,
    data: { role?: WorkspaceInvitation['role']; expiresAt?: Date; acceptedAt?: Date | null },
  ): Promise<WorkspaceInvitation> {
    const updated = await this.prisma.workspaceInvitation.update({
      where: { id },
      data: {
        role: data.role,
        expiresAt: data.expiresAt,
        acceptedAt: data.acceptedAt,
      },
    });
    return WorkspaceInvitation.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workspaceInvitation.delete({
      where: { id },
    });
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.workspaceInvitation.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        acceptedAt: null,
      },
    });
    return result.count;
  }
}
