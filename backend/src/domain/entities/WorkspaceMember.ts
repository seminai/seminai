import { randomUUID } from 'node:crypto';
import { WorkspaceMember as PrismaWorkspaceMember, WorkspaceRole } from '@prisma/client';

interface WorkspaceMemberProps {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  canManageRules: boolean;
  canInviteMembers: boolean;
}

export class WorkspaceMember {
  public readonly id: string;
  public readonly workspaceId: string;
  public readonly userId: string;
  public readonly role: WorkspaceRole;
  public readonly canManageRules: boolean;
  public readonly canInviteMembers: boolean;
  public readonly joinedAt: Date;
  public readonly updatedAt: Date;

  constructor(
    id: string,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    canManageRules: boolean,
    canInviteMembers: boolean,
    joinedAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.userId = userId;
    this.role = role;
    this.canManageRules = canManageRules;
    this.canInviteMembers = canInviteMembers;
    this.joinedAt = joinedAt;
    this.updatedAt = updatedAt;
  }

  static create(props: WorkspaceMemberProps): WorkspaceMember {
    const now = new Date();
    return new WorkspaceMember(
      randomUUID(),
      props.workspaceId,
      props.userId,
      props.role,
      props.canManageRules,
      props.canInviteMembers,
      now,
      now,
    );
  }

  static fromPrisma(prismaMember: PrismaWorkspaceMember): WorkspaceMember {
    return new WorkspaceMember(
      prismaMember.id,
      prismaMember.workspaceId,
      prismaMember.userId,
      prismaMember.role,
      prismaMember.canManageRules,
      prismaMember.canInviteMembers,
      prismaMember.joinedAt,
      prismaMember.updatedAt,
    );
  }

  /**
   * Check if member is owner
   */
  isOwner(): boolean {
    return this.role === 'OWNER';
  }

  /**
   * Check if member is admin or owner
   */
  isAdmin(): boolean {
    return this.role === 'OWNER' || this.role === 'ADMIN';
  }

  /**
   * Check if member can manage workspace settings
   */
  canManageWorkspace(): boolean {
    return this.isAdmin();
  }

  /**
   * Check if member can manage rules (explicit permission or admin)
   */
  hasRuleManagementPermission(): boolean {
    return this.isAdmin() || this.canManageRules;
  }

  /**
   * Check if member can invite others (explicit permission or admin)
   */
  hasInvitePermission(): boolean {
    return this.isAdmin() || this.canInviteMembers;
  }
}
