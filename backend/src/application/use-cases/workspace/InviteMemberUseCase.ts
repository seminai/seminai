import bcrypt from 'bcryptjs';
import { WorkspaceInvitation } from '../../../domain/entities/WorkspaceInvitation';
import { User } from '../../../domain/entities/User';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceInvitationRepository } from '../../../domain/repositories/IWorkspaceInvitationRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { InviteMemberDTO } from '../../../domain/dtos/workspace.dto';
import { AppError } from '../../../domain/errors/AppError';
import { WorkspaceRole, UserRole } from '@prisma/client';
import { EmailService } from '../../../infrastructure/services/EmailService';
import { WorkspacePlanLimitsPolicy } from '../../services/workspace/WorkspacePlanLimitsPolicy';
import { isPendingActivation } from '../../utils/user-activation';
import { generateTemporaryPassword } from '../../utils/temporary-password';

interface InviteMemberRequest {
  data: InviteMemberDTO;
}

export class InviteMemberUseCase {
  private emailService: EmailService;

  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private workspaceInvitationRepository: IWorkspaceInvitationRepository,
    private userRepository: IUserRepository,
  ) {
    this.emailService = EmailService.getInstance();
  }

  async execute(request: InviteMemberRequest): Promise<WorkspaceInvitation> {
    const { data } = request;
    const { workspaceId, email, role, invitedById } = data;

    // Check if inviter is a member with invite permission
    const inviter = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      invitedById,
    );
    if (!inviter) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!inviter.hasInvitePermission()) {
      throw AppError.forbidden(
        'You do not have permission to invite members',
        'NO_INVITE_PERMISSION',
      );
    }

    // Cannot invite as OWNER
    if (role === WorkspaceRole.OWNER) {
      throw AppError.badRequest('Cannot invite as owner', 'CANNOT_INVITE_AS_OWNER');
    }

    // Check workspace limits
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const memberCount = await this.workspaceRepository.countMembers(workspaceId);
    const limits = WorkspacePlanLimitsPolicy.getLimits(workspace.plan);
    if (memberCount >= limits.maxMembers) {
      throw AppError.badRequest(
        'Workspace has reached maximum member limit',
        'MEMBER_LIMIT_REACHED',
      );
    }

    // Check if user is already a member
    const normalizedEmail = email.toLowerCase();
    let existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      const existingMember = await this.workspaceMemberRepository.findByWorkspaceAndUser(
        workspaceId,
        existingUser.id,
      );
      if (existingMember) {
        throw AppError.conflict('User is already a member of this workspace', 'ALREADY_MEMBER');
      }
    }

    // Get inviter user to get their name for the email
    const inviterUser = await this.userRepository.findById(invitedById);
    if (!inviterUser) {
      throw AppError.notFound('Inviter user not found', 'INVITER_NOT_FOUND');
    }
    const inviterName = inviterUser.name;
    const workspaceName = workspace.name;

    // Create user if doesn't exist
    let temporaryPassword: string | null = null;
    if (!existingUser) {
      temporaryPassword = generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 8);
      const randomName = this.generateRandomName();
      existingUser = User.create({
        email: normalizedEmail,
        password: hashedPassword,
        name: randomName,
        surname: null,
        fiscalCode: null,
        companyName: null,
        vatNumber: null,
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
        role: UserRole.BASIC,
        credits: 10,
      });
      existingUser = await this.userRepository.create(existingUser);
    }

    // Check if there's already a pending invitation
    const existingInvitation = await this.workspaceInvitationRepository.findByWorkspaceAndEmail(
      workspaceId,
      normalizedEmail,
    );

    let invitation: WorkspaceInvitation;

    if (existingInvitation && existingInvitation.isValid()) {
      // If valid invitation exists, update it (role might have changed) and resend email
      const finalRole = role || WorkspaceRole.MEMBER;
      if (existingInvitation.role !== finalRole) {
        invitation = await this.workspaceInvitationRepository.update(existingInvitation.id, {
          role: finalRole,
        });
      } else {
        invitation = existingInvitation;
      }
    } else {
      // Delete invalid invitation if exists (expired or already used)
      if (existingInvitation) {
        await this.workspaceInvitationRepository.delete(existingInvitation.id);
      }

      // Create new invitation
      invitation = WorkspaceInvitation.create({
        workspaceId,
        email: normalizedEmail,
        role: role || WorkspaceRole.MEMBER,
        invitedById,
        expiresAt: WorkspaceInvitation.createDefaultExpirationDate(),
      });

      invitation = await this.workspaceInvitationRepository.create(invitation);
    }

    // Send invitation email (always resend, even if invitation already exists)
    try {
      if (isPendingActivation(existingUser)) {
        const invitationPassword = temporaryPassword ?? generateTemporaryPassword();
        if (!temporaryPassword) {
          const hashedPassword = await bcrypt.hash(invitationPassword, 8);
          existingUser = await this.userRepository.update(existingUser.id, {
            password: hashedPassword,
          });
        }
        await this.emailService.sendInvitationEmail(
          existingUser.email,
          existingUser.name,
          invitationPassword,
          inviterName,
        );
      } else {
        // Existing user - send workspace invitation email with token for direct acceptance
        await this.emailService.sendWorkspaceInvitationEmail(
          existingUser.email,
          existingUser.name,
          inviterName,
          workspaceName,
          invitation.token,
        );
      }
    } catch (emailError) {
      // Best-effort email: non bloccare l'invito se l'email fallisce
      console.error('❌ Errore invio email invito workspace:', {
        email: existingUser.email,
        workspaceId,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    return invitation;
  }

  private generateRandomName(): string {
    const adjectives = [
      'Nuovo',
      'Attivo',
      'Creativo',
      'Dinamico',
      'Efficiente',
      'Innovativo',
      'Produttivo',
      'Sicuro',
      'Valido',
      'Veloce',
    ];
    const nouns = [
      'Utente',
      'Membro',
      'Collaboratore',
      'Partner',
      'Operatore',
      'Specialista',
      'Esperto',
      'Professionista',
      'Consulente',
      'Manager',
    ];
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNumber = Math.floor(Math.random() * 1000);
    return `${randomAdjective} ${randomNoun} ${randomNumber}`;
  }
}
