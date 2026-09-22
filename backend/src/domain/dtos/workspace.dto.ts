import { WorkspaceModule, WorkspacePlan, WorkspaceRole, WorkspaceKind } from '@prisma/client';

export interface CreateWorkspaceDTO {
  name: string;
  kind: WorkspaceKind;
  slug?: string;
  description?: string | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  plan?: WorkspacePlan;
  enabledModules?: WorkspaceModule[];
  companyIds?: string[];
}

export interface UpdateWorkspaceDTO {
  name?: string;
  slug?: string;
  description?: string | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  plan?: WorkspacePlan;
  customCss?: string | null;
  isActive?: boolean;
  maxMembers?: number;
  maxRules?: number;
  enabledModules?: WorkspaceModule[];
}

export interface InviteMemberDTO {
  workspaceId: string;
  email: string;
  role?: WorkspaceRole;
  invitedById: string;
}

export interface UpdateMemberDTO {
  role?: WorkspaceRole;
  canManageRules?: boolean;
  canInviteMembers?: boolean;
}

export interface WorkspaceWithMembersDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  plan: WorkspacePlan;
  kind: WorkspaceKind;
  isActive: boolean;
  maxMembers: number;
  maxRules: number;
  enabledModules: WorkspaceModule[];
  createdAt: Date;
  updatedAt: Date;
  membersCount: number;
  rulesCount: number;
}

export interface WorkspaceMemberWithUserDTO {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  canManageRules: boolean;
  canInviteMembers: boolean;
  joinedAt: Date;
  user: {
    id: string;
    name: string;
    surname: string | null;
    email: string;
    profilePictureUrl: string | null;
  };
}

export interface WorkspaceInvitationWithUserDTO {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  user: {
    id: string | null;
    name: string | null;
    surname: string | null;
    email: string;
    profilePictureUrl: string | null;
  } | null;
}

export interface PendingInvitationWithWorkspaceDTO {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  invitedById: string;
  expiresAt: Date;
  createdAt: Date;
  workspace: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    iconUrl: string | null;
    kind: WorkspaceKind;
  };
}
