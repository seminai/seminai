import { WorkspaceMember } from '../entities/WorkspaceMember';
import { WorkspaceMemberWithUserDTO } from '../dtos/workspace.dto';

export interface IWorkspaceMemberRepository {
  create(member: WorkspaceMember): Promise<WorkspaceMember>;
  findById(id: string): Promise<WorkspaceMember | null>;
  findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;
  findByWorkspaceId(workspaceId: string): Promise<WorkspaceMember[]>;
  findByWorkspaceIdWithUsers(workspaceId: string): Promise<WorkspaceMemberWithUserDTO[]>;
  findByUserId(userId: string): Promise<WorkspaceMember[]>;
  update(id: string, data: Partial<WorkspaceMember>): Promise<WorkspaceMember>;
  delete(id: string): Promise<void>;
  deleteByWorkspaceAndUser(workspaceId: string, userId: string): Promise<void>;
}
