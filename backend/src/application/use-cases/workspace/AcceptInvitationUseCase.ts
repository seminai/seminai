import { WorkspaceMember } from '../../../domain/entities/WorkspaceMember';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceInvitationRepository } from '../../../domain/repositories/IWorkspaceInvitationRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';
import { WorkspacePlanLimitsPolicy } from '../../services/workspace/WorkspacePlanLimitsPolicy';

interface AcceptInvitationRequest {
  token: string;
  userId: string;
}

export class AcceptInvitationUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private workspaceInvitationRepository: IWorkspaceInvitationRepository,
    private userRepository: IUserRepository,
  ) {}

  async execute(request: AcceptInvitationRequest): Promise<WorkspaceMember> {
    const { token, userId } = request;

    // Find invitation by token
    const invitation = await this.workspaceInvitationRepository.findByToken(token);
    if (!invitation) {
      throw AppError.notFound('Invitation not found', 'INVITATION_NOT_FOUND');
    }

    // Check if invitation is valid
    if (!invitation.isValid()) {
      if (invitation.isExpired()) {
        throw AppError.badRequest('Invitation has expired', 'INVITATION_EXPIRED');
      }
      if (invitation.isAccepted()) {
        throw AppError.badRequest('Invitation has already been used', 'INVITATION_USED');
      }
    }

    // Get user and verify email matches
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw AppError.forbidden('This invitation was sent to a different email', 'EMAIL_MISMATCH');
    }

    // Check if already a member
    const existingMember = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      invitation.workspaceId,
      userId,
    );
    if (existingMember) {
      throw AppError.conflict('You are already a member of this workspace', 'ALREADY_MEMBER');
    }
    const workspace = await this.workspaceRepository.findById(invitation.workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const memberCount = await this.workspaceRepository.countMembers(invitation.workspaceId);
    const limits = WorkspacePlanLimitsPolicy.getLimits(workspace.plan);
    if (memberCount >= limits.maxMembers) {
      throw AppError.badRequest(
        'Workspace has reached maximum member limit',
        'MEMBER_LIMIT_REACHED',
      );
    }

    // Create member
    const member = WorkspaceMember.create({
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role,
      canManageRules: false,
      canInviteMembers: false,
    });

    const createdMember = await this.workspaceMemberRepository.create(member);

    // Mark invitation as accepted
    await this.workspaceInvitationRepository.update(invitation.id, {
      acceptedAt: new Date(),
    } as any);

    return createdMember;
  }
}
