import { Workspace } from '../../../domain/entities/Workspace';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';

export class ListUserWorkspacesUseCase {
  constructor(private workspaceRepository: IWorkspaceRepository) {}

  async execute(userId: string): Promise<Workspace[]> {
    return this.workspaceRepository.findByUserId(userId);
  }
}
