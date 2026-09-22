import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { WorkspaceWithMembersDTO } from '../../../domain/dtos/workspace.dto';
import { AppError } from '../../../domain/errors/AppError';

interface GetWorkspaceRequest {
  workspaceId: string;
  userId: string;
}

export class GetWorkspaceUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: GetWorkspaceRequest): Promise<WorkspaceWithMembersDTO> {
    const { workspaceId, userId } = request;

    // Check if user is a member of the workspace
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }

    const workspace = await this.workspaceRepository.findWithCounts(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    return workspace;
  }
}
