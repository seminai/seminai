import { WorkspaceInvitation } from '../entities/WorkspaceInvitation';

export interface IWorkspaceInvitationRepository {
  create(invitation: WorkspaceInvitation): Promise<WorkspaceInvitation>;
  findById(id: string): Promise<WorkspaceInvitation | null>;
  findByToken(token: string): Promise<WorkspaceInvitation | null>;
  findByWorkspaceAndEmail(workspaceId: string, email: string): Promise<WorkspaceInvitation | null>;
  findByWorkspaceId(workspaceId: string): Promise<WorkspaceInvitation[]>;
  findPendingByWorkspaceId(workspaceId: string): Promise<WorkspaceInvitation[]>;
  findPendingByEmail(email: string): Promise<WorkspaceInvitation[]>;
  update(
    id: string,
    data: { readonly role?: WorkspaceInvitation['role']; readonly expiresAt?: Date; readonly acceptedAt?: Date | null },
  ): Promise<WorkspaceInvitation>;
  delete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
}
