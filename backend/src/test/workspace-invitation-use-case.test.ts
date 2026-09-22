import { UserRole, WorkspaceKind, WorkspacePlan, WorkspaceRole } from '@prisma/client';
import { InviteMemberUseCase } from '../application/use-cases/workspace/InviteMemberUseCase';
import { Workspace } from '../domain/entities/Workspace';
import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { User } from '../domain/entities/User';
import { IWorkspaceRepository } from '../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceInvitationRepository } from '../domain/repositories/IWorkspaceInvitationRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { EmailService } from '../infrastructure/services/EmailService';

describe('InviteMemberUseCase', () => {
  let workspaceRepository: jest.Mocked<IWorkspaceRepository>;
  let workspaceMemberRepository: jest.Mocked<IWorkspaceMemberRepository>;
  let workspaceInvitationRepository: jest.Mocked<IWorkspaceInvitationRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let sendInvitationEmailSpy: jest.SpyInstance;
  let sendWorkspaceInvitationEmailSpy: jest.SpyInstance;

  beforeEach(() => {
    workspaceRepository = createWorkspaceRepository();
    workspaceMemberRepository = createWorkspaceMemberRepository();
    workspaceInvitationRepository = createWorkspaceInvitationRepository();
    userRepository = createUserRepository();
    sendInvitationEmailSpy = jest
      .spyOn(EmailService.getInstance(), 'sendInvitationEmail')
      .mockResolvedValue();
    sendWorkspaceInvitationEmailSpy = jest
      .spyOn(EmailService.getInstance(), 'sendWorkspaceInvitationEmail')
      .mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resends temporary credentials for existing users that never logged in', async () => {
    const workspace = createWorkspace();
    const inviter = createMember({ userId: 'inviter-1', role: WorkspaceRole.ADMIN });
    const pendingUser = createUser({ id: 'user-1', lastAccessAt: null });
    const updatedUser = createUser({ id: 'user-1', lastAccessAt: null });
    const invitation = createInvitation();
    const useCase = new InviteMemberUseCase(
      workspaceRepository,
      workspaceMemberRepository,
      workspaceInvitationRepository,
      userRepository,
    );
    workspaceMemberRepository.findByWorkspaceAndUser
      .mockResolvedValueOnce(inviter)
      .mockResolvedValueOnce(null);
    workspaceRepository.findById.mockResolvedValue(workspace);
    workspaceRepository.countMembers.mockResolvedValue(1);
    userRepository.findByEmail.mockResolvedValue(pendingUser);
    userRepository.findById.mockResolvedValue(
      createUser({ id: 'inviter-1', lastAccessAt: new Date() }),
    );
    userRepository.update.mockResolvedValue(updatedUser);
    workspaceInvitationRepository.findByWorkspaceAndEmail.mockResolvedValue(invitation);

    const actualInvitation = await useCase.execute({
      data: {
        workspaceId: workspace.id,
        email: 'USER@EXAMPLE.COM',
        role: WorkspaceRole.MEMBER,
        invitedById: 'inviter-1',
      },
    });

    expect(userRepository.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(userRepository.update).toHaveBeenCalledWith(pendingUser.id, {
      password: expect.any(String),
    });
    expect(sendInvitationEmailSpy).toHaveBeenCalledWith(
      updatedUser.email,
      updatedUser.name,
      expect.any(String),
      'Pending User',
    );
    expect(sendWorkspaceInvitationEmailSpy).not.toHaveBeenCalled();
    expect(actualInvitation).toBe(invitation);
  });
});

function createWorkspace(): Workspace {
  return new Workspace(
    'workspace-1',
    'Main workspace',
    'main-workspace',
    null,
    null,
    null,
    '#2563eb',
    '#1e40af',
    '#3b82f6',
    null,
    WorkspaceKind.AGRICULTURAL,
    WorkspacePlan.PROFESSIONAL,
    true,
    50,
    100,
    new Date(),
    new Date(),
  );
}

function createMember(input: { readonly userId: string; readonly role: WorkspaceRole }) {
  return new WorkspaceMember(
    `member-${input.userId}`,
    'workspace-1',
    input.userId,
    input.role,
    true,
    true,
    new Date(),
    new Date(),
  );
}

function createInvitation(): WorkspaceInvitation {
  return new WorkspaceInvitation(
    'invitation-1',
    'workspace-1',
    'user@example.com',
    WorkspaceRole.MEMBER,
    'token-1',
    'inviter-1',
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    null,
    new Date(),
  );
}

function createUser(input: { readonly id: string; readonly lastAccessAt: Date | null }): User {
  return new User(
    input.id,
    input.id === 'inviter-1' ? 'inviter@example.com' : 'user@example.com',
    'hashed-password',
    'Pending User',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    UserRole.BASIC,
    10,
    false,
    new Date(),
    new Date(),
    null,
    input.lastAccessAt,
  );
}

function createWorkspaceRepository(): jest.Mocked<IWorkspaceRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    findByUserId: jest.fn(),
    findWithCounts: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    countMembers: jest.fn(),
    countRules: jest.fn(),
  };
}

function createWorkspaceMemberRepository(): jest.Mocked<IWorkspaceMemberRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByWorkspaceAndUser: jest.fn(),
    findByWorkspaceId: jest.fn(),
    findByWorkspaceIdWithUsers: jest.fn(),
    findByUserId: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteByWorkspaceAndUser: jest.fn(),
  };
}

function createWorkspaceInvitationRepository(): jest.Mocked<IWorkspaceInvitationRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByToken: jest.fn(),
    findByWorkspaceAndEmail: jest.fn(),
    findByWorkspaceId: jest.fn(),
    findPendingByWorkspaceId: jest.fn(),
    findPendingByEmail: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteExpired: jest.fn(),
  };
}

function createUserRepository(): jest.Mocked<IUserRepository> {
  return {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findByPhoneNumber: jest.fn(),
    findByGoogleId: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deductCredits: jest.fn(),
  };
}
