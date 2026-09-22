import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';

interface RemoveMemberRequest {
  workspaceId: string;
  memberId: string;
  requesterId: string;
}

export class RemoveMemberUseCase {
  constructor(private workspaceMemberRepository: IWorkspaceMemberRepository) {}

  async execute(request: RemoveMemberRequest): Promise<void> {
    const { workspaceId, memberId, requesterId } = request;

    // Check if requester is admin
    const requester = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      requesterId,
    );
    if (!requester) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!requester.isAdmin()) {
      throw AppError.forbidden('Only admins can remove members', 'NOT_ADMIN');
    }

    // Get member to remove
    const memberToRemove = await this.workspaceMemberRepository.findById(memberId);
    if (!memberToRemove) {
      throw AppError.notFound('Member not found', 'MEMBER_NOT_FOUND');
    }
    if (memberToRemove.workspaceId !== workspaceId) {
      throw AppError.badRequest(
        'Member does not belong to this workspace',
        'MEMBER_NOT_IN_WORKSPACE',
      );
    }

    // Cannot remove the owner
    if (memberToRemove.isOwner()) {
      throw AppError.forbidden('Cannot remove the workspace owner', 'CANNOT_REMOVE_OWNER');
    }

    // Cannot remove yourself (use leave instead)
    if (memberToRemove.userId === requesterId) {
      throw AppError.badRequest(
        'Cannot remove yourself, use leave workspace instead',
        'CANNOT_REMOVE_SELF',
      );
    }

    await this.workspaceMemberRepository.delete(memberId);
  }
}
