import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceInvitationRepository } from '../../../domain/repositories/IWorkspaceInvitationRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import {
  WorkspaceMemberWithUserDTO,
  WorkspaceInvitationWithUserDTO,
} from '../../../domain/dtos/workspace.dto';
import { AppError } from '../../../domain/errors/AppError';

interface ListWorkspaceMembersRequest {
  workspaceId: string;
  userId: string;
}

interface ListWorkspaceMembersResponse {
  members: WorkspaceMemberWithUserDTO[];
  invitations: WorkspaceInvitationWithUserDTO[];
}

export class ListWorkspaceMembersUseCase {
  constructor(
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private workspaceInvitationRepository: IWorkspaceInvitationRepository,
    private userRepository: IUserRepository,
  ) {}

  async execute(request: ListWorkspaceMembersRequest): Promise<ListWorkspaceMembersResponse> {
    const { workspaceId, userId } = request;

    // Check if user is a member
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }

    const members = await this.workspaceMemberRepository.findByWorkspaceIdWithUsers(workspaceId);

    // Get pending invitations
    const pendingInvitations =
      await this.workspaceInvitationRepository.findPendingByWorkspaceId(workspaceId);

    // Map invitations to DTOs with user data
    const invitations: WorkspaceInvitationWithUserDTO[] = await Promise.all(
      pendingInvitations.map(async (invitation) => {
        const user = await this.userRepository.findByEmail(invitation.email);
        return {
          id: invitation.id,
          workspaceId: invitation.workspaceId,
          email: invitation.email,
          role: invitation.role,
          token: invitation.token,
          invitedById: invitation.invitedById,
          expiresAt: invitation.expiresAt,
          acceptedAt: invitation.acceptedAt,
          createdAt: invitation.createdAt,
          user: user
            ? {
                id: user.id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                profilePictureUrl: user.profilePictureUrl,
              }
            : null,
        };
      }),
    );

    return {
      members,
      invitations,
    };
  }
}
