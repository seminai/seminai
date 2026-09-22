import { Workspace } from '../entities/Workspace';
import { WorkspaceWithMembersDTO } from '../dtos/workspace.dto';

export interface IWorkspaceRepository {
  create(workspace: Workspace): Promise<Workspace>;
  findById(id: string): Promise<Workspace | null>;
  findBySlug(slug: string): Promise<Workspace | null>;
  findByUserId(userId: string): Promise<Workspace[]>;
  findWithCounts(id: string): Promise<WorkspaceWithMembersDTO | null>;
  update(id: string, data: Partial<Workspace>): Promise<Workspace>;
  delete(id: string): Promise<void>;
  countMembers(workspaceId: string): Promise<number>;
  countRules(workspaceId: string): Promise<number>;
}
