import { IWorkspaceInvitationRepository } from '../../../domain/repositories/IWorkspaceInvitationRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { PendingInvitationWithWorkspaceDTO } from '../../../domain/dtos/workspace.dto';
import { AppError } from '../../../domain/errors/AppError';

export class ListUserPendingInvitationsUseCase {
  constructor(
    private workspaceInvitationRepository: IWorkspaceInvitationRepository,
    private workspaceRepository: IWorkspaceRepository,
    private userRepository: IUserRepository,
  ) {}

  async execute(userId: string): Promise<PendingInvitationWithWorkspaceDTO[]> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const pendingInvitations = await this.workspaceInvitationRepository.findPendingByEmail(
      user.email,
    );

    const invitationsWithWorkspacePromises = pendingInvitations.map(async (invitation) => {
      const workspace = await this.workspaceRepository.findById(invitation.workspaceId);
      if (!workspace) {
        return null;
      }
      return {
        id: invitation.id,
        workspaceId: invitation.workspaceId,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        invitedById: invitation.invitedById,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          description: workspace.description,
          logoUrl: workspace.logoUrl,
          iconUrl: workspace.iconUrl,
          kind: workspace.kind,
        },
      };
    });

    const invitationsWithWorkspace = await Promise.all(invitationsWithWorkspacePromises);

    return invitationsWithWorkspace.filter(
      (inv): inv is PendingInvitationWithWorkspaceDTO => inv !== null,
    );
  }
}
