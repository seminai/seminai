import { PrismaWorkspaceRepository } from '../infrastructure/repositories/PrismaWorkspaceRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../infrastructure/repositories/PrismaCompanyOnWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../infrastructure/repositories/PrismaWorkspaceMemberRepository';
import { PrismaWorkspaceInvitationRepository } from '../infrastructure/repositories/PrismaWorkspaceInvitationRepository';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { CreateWorkspaceUseCase } from '../application/use-cases/workspace/CreateWorkspaceUseCase';
import { GetWorkspaceUseCase } from '../application/use-cases/workspace/GetWorkspaceUseCase';
import { ListUserWorkspacesUseCase } from '../application/use-cases/workspace/ListUserWorkspacesUseCase';
import { UpdateWorkspaceUseCase } from '../application/use-cases/workspace/UpdateWorkspaceUseCase';
import { DeleteWorkspaceUseCase } from '../application/use-cases/workspace/DeleteWorkspaceUseCase';
import { InviteMemberUseCase } from '../application/use-cases/workspace/InviteMemberUseCase';
import { AcceptInvitationUseCase } from '../application/use-cases/workspace/AcceptInvitationUseCase';
import { RemoveMemberUseCase } from '../application/use-cases/workspace/RemoveMemberUseCase';
import { UpdateMemberUseCase } from '../application/use-cases/workspace/UpdateMemberUseCase';
import { ListWorkspaceMembersUseCase } from '../application/use-cases/workspace/ListWorkspaceMembersUseCase';
import { ListWorkspaceCompaniesUseCase } from '../application/use-cases/workspace/ListWorkspaceCompaniesUseCase';
import { ReplaceWorkspaceCompaniesUseCase } from '../application/use-cases/workspace/ReplaceWorkspaceCompaniesUseCase';
import { prisma, createTestUser, deleteTestUser, deleteAllTestWorkspaces } from './helpers';
import { TEST_INVITE_CODE } from './constants';
import { AppError } from '../domain/errors/AppError';
import { WorkspaceKind, WorkspaceRole } from '@prisma/client';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
describe('Workspace Integration Tests', () => {
  let workspaceRepository: PrismaWorkspaceRepository;
  let workspaceMemberRepository: PrismaWorkspaceMemberRepository;
  let workspaceInvitationRepository: PrismaWorkspaceInvitationRepository;
  let userRepository: PrismaUserRepository;
  let createWorkspaceUseCase: CreateWorkspaceUseCase;
  let getWorkspaceUseCase: GetWorkspaceUseCase;
void (() => getWorkspaceUseCase);
  let listUserWorkspacesUseCase: ListUserWorkspacesUseCase;
void (() => listUserWorkspacesUseCase);
  let updateWorkspaceUseCase: UpdateWorkspaceUseCase;
void (() => updateWorkspaceUseCase);
  let deleteWorkspaceUseCase: DeleteWorkspaceUseCase;
void (() => deleteWorkspaceUseCase);
  let inviteMemberUseCase: InviteMemberUseCase;
  let acceptInvitationUseCase: AcceptInvitationUseCase;
  let removeMemberUseCase: RemoveMemberUseCase;
void (() => removeMemberUseCase);
  let updateMemberUseCase: UpdateMemberUseCase;
void (() => updateMemberUseCase);
  let listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase;
  let listWorkspaceCompaniesUseCase: ListWorkspaceCompaniesUseCase;
void (() => listWorkspaceCompaniesUseCase);
  let replaceWorkspaceCompaniesUseCase: ReplaceWorkspaceCompaniesUseCase;
void (() => replaceWorkspaceCompaniesUseCase);
  let companyRepository: PrismaCompanyRepository;
  let companyOnWorkspaceRepository: PrismaCompanyOnWorkspaceRepository;
  let testUserId: string;
  let secondTestUserId: string;

  beforeAll(async () => {
    workspaceRepository = new PrismaWorkspaceRepository(prisma);
    workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
    workspaceInvitationRepository = new PrismaWorkspaceInvitationRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);

    companyRepository = new PrismaCompanyRepository(prisma);
    companyOnWorkspaceRepository = new PrismaCompanyOnWorkspaceRepository(prisma);

    createWorkspaceUseCase = new CreateWorkspaceUseCase(
      workspaceRepository,
      workspaceMemberRepository,
      companyOnWorkspaceRepository,
      companyRepository,
    );
    getWorkspaceUseCase = new GetWorkspaceUseCase(workspaceRepository, workspaceMemberRepository);
    listUserWorkspacesUseCase = new ListUserWorkspacesUseCase(workspaceRepository);
    updateWorkspaceUseCase = new UpdateWorkspaceUseCase(
      workspaceRepository,
      workspaceMemberRepository,
    );
    deleteWorkspaceUseCase = new DeleteWorkspaceUseCase(
      workspaceRepository,
      workspaceMemberRepository,
    );
    inviteMemberUseCase = new InviteMemberUseCase(
      workspaceRepository,
      workspaceMemberRepository,
      workspaceInvitationRepository,
      userRepository,
    );
    acceptInvitationUseCase = new AcceptInvitationUseCase(
      workspaceRepository,
      workspaceMemberRepository,
      workspaceInvitationRepository,
      userRepository,
    );
    removeMemberUseCase = new RemoveMemberUseCase(workspaceMemberRepository);
    updateMemberUseCase = new UpdateMemberUseCase(workspaceMemberRepository);
    listWorkspaceMembersUseCase = new ListWorkspaceMembersUseCase(
      workspaceMemberRepository,
      workspaceInvitationRepository,
      userRepository,
    );
    listWorkspaceCompaniesUseCase = new ListWorkspaceCompaniesUseCase(
      companyOnWorkspaceRepository,
      workspaceMemberRepository,
    );
    replaceWorkspaceCompaniesUseCase = new ReplaceWorkspaceCompaniesUseCase(
      companyOnWorkspaceRepository,
      companyRepository,
      workspaceRepository,
      workspaceMemberRepository,
    );

    const testUser = await createTestUser();
    testUserId = testUser.id;

    // Create a second user for invitation tests
    const registerUseCase = new RegisterUseCase(userRepository);
    try {
      const secondUser = await registerUseCase.execute({
        email: 'second.test.user@seminai.test',
        password: 'TestPassword123!',
        name: 'Second Test User',
        inviteCode: TEST_INVITE_CODE,
      });
      secondTestUserId = secondUser.id;
    } catch {
      const existingUser = await userRepository.findByEmail('second.test.user@seminai.test');
      if (existingUser) {
        secondTestUserId = existingUser.id;
      }
    }
  });

  afterAll(async () => {
    await deleteAllTestWorkspaces(testUserId);
    if (secondTestUserId) {
      await deleteAllTestWorkspaces(secondTestUserId);
      await prisma.user.delete({ where: { id: secondTestUserId } }).catch(() => {});
    }
    await deleteTestUser();
  });

  beforeEach(async () => {
    await deleteAllTestWorkspaces(testUserId);
    if (secondTestUserId) {
      await deleteAllTestWorkspaces(secondTestUserId);
    }
  });

  describe('InviteMemberUseCase', () => {
    it('should create invitation successfully', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Invite Workspace' },
        userId: testUserId,
      });

      const actualInvitation = await inviteMemberUseCase.execute({
        data: {
          workspaceId: created.workspace.id,
          email: 'newinvite@test.com',
          role: WorkspaceRole.MEMBER,
          invitedById: testUserId,
        },
      });

      expect(actualInvitation).toBeDefined();
      expect(actualInvitation.email).toBe('newinvite@test.com');
      expect(actualInvitation.role).toBe(WorkspaceRole.MEMBER);
      expect(actualInvitation.token).toBeDefined();
    });

    it('should throw error when inviting as owner', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'No Owner Invite' },
        userId: testUserId,
      });

      await expect(
        inviteMemberUseCase.execute({
          data: {
            workspaceId: created.workspace.id,
            email: 'owner@test.com',
            role: WorkspaceRole.OWNER,
            invitedById: testUserId,
          },
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('AcceptInvitationUseCase', () => {
    it('should accept invitation and create member', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Accept Invite Workspace' },
        userId: testUserId,
      });

      const invitation = await inviteMemberUseCase.execute({
        data: {
          workspaceId: created.workspace.id,
          email: 'second.test.user@seminai.test',
          role: WorkspaceRole.MEMBER,
          invitedById: testUserId,
        },
      });

      const actualMember = await acceptInvitationUseCase.execute({
        token: invitation.token,
        userId: secondTestUserId,
      });

      expect(actualMember).toBeDefined();
      expect(actualMember.workspaceId).toBe(created.workspace.id);
      expect(actualMember.userId).toBe(secondTestUserId);
      expect(actualMember.role).toBe(WorkspaceRole.MEMBER);
    });

    it('should throw error for expired invitation', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Expired Invite Workspace' },
        userId: testUserId,
      });

      // Create expired invitation directly
      await prisma.workspaceInvitation.create({
        data: {
          workspaceId: created.workspace.id,
          email: 'second.test.user@seminai.test',
          role: WorkspaceRole.MEMBER,
          token: 'expired-token',
          invitedById: testUserId,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await expect(
        acceptInvitationUseCase.execute({
          token: 'expired-token',
          userId: secondTestUserId,
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('ListWorkspaceMembersUseCase', () => {
    it('should list all members with user info', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Members Workspace' },
        userId: testUserId,
      });

      const result = await listWorkspaceMembersUseCase.execute({
        workspaceId: created.workspace.id,
        userId: testUserId,
      });

      expect(result.members).toHaveLength(1);
      expect(result.members[0].role).toBe(WorkspaceRole.OWNER);
      expect(result.members[0].user).toBeDefined();
      expect(result.members[0].user.email).toBeDefined();
    });
  });});
