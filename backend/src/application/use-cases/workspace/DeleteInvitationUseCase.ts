import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceInvitationRepository } from '../../../domain/repositories/IWorkspaceInvitationRepository';
import { AppError } from '../../../domain/errors/AppError';

interface DeleteInvitationRequest {
  workspaceId: string;
  invitationId: string;
  requesterId: string;
}

export class DeleteInvitationUseCase {
  constructor(
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private workspaceInvitationRepository: IWorkspaceInvitationRepository,
  ) {}

  async execute(request: DeleteInvitationRequest): Promise<void> {
    const { workspaceId, invitationId, requesterId } = request;

    // Check if requester is a member of the workspace
    const requester = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      requesterId,
    );
    if (!requester) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }

    // Get invitation
    const invitation = await this.workspaceInvitationRepository.findById(invitationId);
    if (!invitation) {
      throw AppError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
    }

    // Verify invitation belongs to the workspace
    if (invitation.workspaceId !== workspaceId) {
      throw AppError.badRequest(
        'Invitation does not belong to this workspace',
        'INVITATION_NOT_IN_WORKSPACE',
      );
    }

    // Check permissions: requester must be admin OR the one who created the invitation
    if (!requester.isAdmin() && invitation.invitedById !== requesterId) {
      throw AppError.forbidden(
        'Only admins or the invitation creator can delete invitations',
        'NO_DELETE_PERMISSION',
      );
    }

    await this.workspaceInvitationRepository.delete(invitationId);
  }
}
