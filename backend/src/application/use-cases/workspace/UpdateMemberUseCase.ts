import { WorkspaceMember } from '../../../domain/entities/WorkspaceMember';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { UpdateMemberDTO } from '../../../domain/dtos/workspace.dto';
import { AppError } from '../../../domain/errors/AppError';
import { WorkspaceRole } from '@prisma/client';

interface UpdateMemberRequest {
  workspaceId: string;
  memberId: string;
  requesterId: string;
  data: UpdateMemberDTO;
}

export class UpdateMemberUseCase {
  constructor(private workspaceMemberRepository: IWorkspaceMemberRepository) {}

  async execute(request: UpdateMemberRequest): Promise<WorkspaceMember> {
    const { workspaceId, memberId, requesterId, data } = request;

    // Check if requester is admin
    const requester = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      requesterId,
    );
    if (!requester) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!requester.isAdmin()) {
      throw AppError.forbidden('Only admins can update member roles', 'NOT_ADMIN');
    }

    // Get member to update
    const memberToUpdate = await this.workspaceMemberRepository.findById(memberId);
    if (!memberToUpdate) {
      throw AppError.notFound('Member not found', 'MEMBER_NOT_FOUND');
    }
    if (memberToUpdate.workspaceId !== workspaceId) {
      throw AppError.badRequest(
        'Member does not belong to this workspace',
        'MEMBER_NOT_IN_WORKSPACE',
      );
    }

    // Cannot change owner role (transfer ownership is a separate action)
    if (memberToUpdate.isOwner() && data.role && data.role !== WorkspaceRole.OWNER) {
      throw AppError.forbidden('Cannot change owner role directly', 'CANNOT_CHANGE_OWNER_ROLE');
    }

    // Cannot promote to owner
    if (data.role === WorkspaceRole.OWNER) {
      throw AppError.forbidden(
        'Cannot promote to owner, use transfer ownership',
        'CANNOT_PROMOTE_TO_OWNER',
      );
    }

    return this.workspaceMemberRepository.update(memberId, data);
  }
}
