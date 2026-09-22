import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';

interface DeleteWorkspaceRequest {
  workspaceId: string;
  userId: string;
}

export class DeleteWorkspaceUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: DeleteWorkspaceRequest): Promise<void> {
    const { workspaceId, userId } = request;

    // Check if user is owner of the workspace
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.isOwner()) {
      throw AppError.forbidden('Only the owner can delete the workspace', 'NOT_OWNER');
    }

    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    await this.workspaceRepository.delete(workspaceId);
  }
}
