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
void (() => inviteMemberUseCase);
  let acceptInvitationUseCase: AcceptInvitationUseCase;
void (() => acceptInvitationUseCase);
  let removeMemberUseCase: RemoveMemberUseCase;
  let updateMemberUseCase: UpdateMemberUseCase;
  let listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase;
void (() => listWorkspaceMembersUseCase);
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

  describe('UpdateMemberUseCase', () => {
    it('should update member role', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Update Member Workspace' },
        userId: testUserId,
      });

      // Add member directly
      const member = await prisma.workspaceMember.create({
        data: {
          workspaceId: created.workspace.id,
          userId: secondTestUserId,
          role: WorkspaceRole.MEMBER,
          canManageRules: false,
          canInviteMembers: false,
        },
      });

      const actualUpdated = await updateMemberUseCase.execute({
        workspaceId: created.workspace.id,
        memberId: member.id,
        requesterId: testUserId,
        data: { role: WorkspaceRole.ADMIN },
      });

      expect(actualUpdated.role).toBe(WorkspaceRole.ADMIN);
    });
  });

  describe('RemoveMemberUseCase', () => {
    it('should remove member from workspace', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Remove Member Workspace' },
        userId: testUserId,
      });

      // Add member directly
      const member = await prisma.workspaceMember.create({
        data: {
          workspaceId: created.workspace.id,
          userId: secondTestUserId,
          role: WorkspaceRole.MEMBER,
          canManageRules: false,
          canInviteMembers: false,
        },
      });

      await removeMemberUseCase.execute({
        workspaceId: created.workspace.id,
        memberId: member.id,
        requesterId: testUserId,
      });

      const actualMember = await workspaceMemberRepository.findById(member.id);
      expect(actualMember).toBeNull();
    });

    it('should not allow removing owner', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Cannot Remove Owner' },
        userId: testUserId,
      });

      await expect(
        removeMemberUseCase.execute({
          workspaceId: created.workspace.id,
          memberId: created.member.id,
          requesterId: testUserId,
        }),
      ).rejects.toThrow(AppError);
    });
  });});
