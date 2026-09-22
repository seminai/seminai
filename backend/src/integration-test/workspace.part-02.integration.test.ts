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
import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
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
  let deleteWorkspaceUseCase: DeleteWorkspaceUseCase;
  let inviteMemberUseCase: InviteMemberUseCase;
void (() => inviteMemberUseCase);
  let acceptInvitationUseCase: AcceptInvitationUseCase;
void (() => acceptInvitationUseCase);
  let removeMemberUseCase: RemoveMemberUseCase;
void (() => removeMemberUseCase);
  let updateMemberUseCase: UpdateMemberUseCase;
void (() => updateMemberUseCase);
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

  describe('UpdateWorkspaceUseCase', () => {
    it('should update workspace successfully', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Original Name' },
        userId: testUserId,
      });

      const actualResult = await updateWorkspaceUseCase.execute({
        workspaceId: created.workspace.id,
        userId: testUserId,
        data: { name: 'Updated Name', primaryColor: '#00ff00' },
      });

      expect(actualResult.name).toBe('Updated Name');
      expect(actualResult.primaryColor).toBe('#00ff00');
    });

    it('should throw error when non-admin tries to update', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Admin Only Workspace' },
        userId: testUserId,
      });

      // Add second user as member (not admin)
      await workspaceMemberRepository.create(
        WorkspaceMember.create({
          workspaceId: created.workspace.id,
          userId: secondTestUserId,
          role: WorkspaceRole.MEMBER,
          canManageRules: false,
          canInviteMembers: false,
        }),
      );

      await expect(
        updateWorkspaceUseCase.execute({
          workspaceId: created.workspace.id,
          userId: secondTestUserId,
          data: { name: 'Hacked Name' },
        }),
      ).rejects.toThrow(AppError);
    });

    it('should block plan downgrade when current usage exceeds target limits', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: {
          kind: WorkspaceKind.AGRICULTURAL,
          name: 'Downgrade Blocked Workspace',
          plan: 'PROFESSIONAL',
        },
        userId: testUserId,
      });

      const fakeRules = Array.from({ length: 51 }, (_, index) => ({
        workspaceId: created.workspace.id,
        name: `Rule ${index}`,
        slug: `rule-${index}`,
        description: null,
        category: 'DISCIPLINARE' as const,
        status: 'DRAFT' as const,
        content: {},
        sourceUrl: null,
        sourceDocument: null,
        region: null,
        validFrom: null,
        validUntil: null,
        version: '1.0',
        isPublic: false,
        isTemplate: false,
        createdById: testUserId,
      }));
      await prisma.rule.createMany({ data: fakeRules });

      await expect(
        updateWorkspaceUseCase.execute({
          workspaceId: created.workspace.id,
          userId: testUserId,
          data: { plan: 'FREE' },
        }),
      ).rejects.toMatchObject({ code: 'PLAN_DOWNGRADE_LIMIT_EXCEEDED' });
    });
  });

  describe('DeleteWorkspaceUseCase', () => {
    it('should delete workspace (only owner)', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'To Delete' },
        userId: testUserId,
      });

      await deleteWorkspaceUseCase.execute({
        workspaceId: created.workspace.id,
        userId: testUserId,
      });

      const actualDbWorkspace = await workspaceRepository.findById(created.workspace.id);
      expect(actualDbWorkspace).toBeNull();
    });

    it('should throw error when non-owner tries to delete', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Cannot Delete' },
        userId: testUserId,
      });

      // Add second user as admin (not owner)
      await workspaceMemberRepository.create(
        WorkspaceMember.create({
          workspaceId: created.workspace.id,
          userId: secondTestUserId,
          role: WorkspaceRole.ADMIN,
          canManageRules: true,
          canInviteMembers: true,
        }),
      );

      await expect(
        deleteWorkspaceUseCase.execute({
          workspaceId: created.workspace.id,
          userId: secondTestUserId,
        }),
      ).rejects.toThrow(AppError);
    });
  });});
