import { randomUUID } from 'node:crypto';
import { WorkspaceInvitation as PrismaWorkspaceInvitation, WorkspaceRole } from '@prisma/client';

interface WorkspaceInvitationProps {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedById: string;
  expiresAt: Date;
}

export class WorkspaceInvitation {
  public readonly id: string;
  public readonly workspaceId: string;
  public readonly email: string;
  public readonly role: WorkspaceRole;
  public readonly token: string;
  public readonly invitedById: string;
  public readonly expiresAt: Date;
  public readonly acceptedAt: Date | null;
  public readonly createdAt: Date;

  constructor(
    id: string,
    workspaceId: string,
    email: string,
    role: WorkspaceRole,
    token: string,
    invitedById: string,
    expiresAt: Date,
    acceptedAt: Date | null,
    createdAt: Date,
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.email = email;
    this.role = role;
    this.token = token;
    this.invitedById = invitedById;
    this.expiresAt = expiresAt;
    this.acceptedAt = acceptedAt;
    this.createdAt = createdAt;
  }

  static create(props: WorkspaceInvitationProps): WorkspaceInvitation {
    const now = new Date();
    return new WorkspaceInvitation(
      randomUUID(),
      props.workspaceId,
      props.email.toLowerCase().trim(),
      props.role,
      randomUUID(),
      props.invitedById,
      props.expiresAt,
      null,
      now,
    );
  }

  static fromPrisma(prismaInvitation: PrismaWorkspaceInvitation): WorkspaceInvitation {
    return new WorkspaceInvitation(
      prismaInvitation.id,
      prismaInvitation.workspaceId,
      prismaInvitation.email,
      prismaInvitation.role,
      prismaInvitation.token,
      prismaInvitation.invitedById,
      prismaInvitation.expiresAt,
      prismaInvitation.acceptedAt,
      prismaInvitation.createdAt,
    );
  }

  /**
   * Check if invitation is expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if invitation was already accepted
   */
  isAccepted(): boolean {
    return this.acceptedAt !== null;
  }

  /**
   * Check if invitation is still valid (not expired and not accepted)
   */
  isValid(): boolean {
    return !this.isExpired() && !this.isAccepted();
  }

  /**
   * Create default expiration date (7 days from now)
   */
  static createDefaultExpirationDate(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return expiresAt;
  }
}
