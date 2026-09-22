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
import { CreateWorkspaceDTO } from '../domain/dtos/workspace.dto';
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
  let listUserWorkspacesUseCase: ListUserWorkspacesUseCase;
  let updateWorkspaceUseCase: UpdateWorkspaceUseCase;
void (() => updateWorkspaceUseCase);
  let deleteWorkspaceUseCase: DeleteWorkspaceUseCase;
void (() => deleteWorkspaceUseCase);
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

  describe('CreateWorkspaceUseCase', () => {
    it('should create a workspace successfully', async () => {
      const inputWorkspaceData = {
        data: {
          kind: WorkspaceKind.AGRICULTURAL,
          name: 'Studio Agronomico Rossi',
          description: 'Il nostro studio agronomico',
          primaryColor: '#ff0000',
        },
        userId: testUserId,
      };

      const actualResult = await createWorkspaceUseCase.execute(inputWorkspaceData);

      expect(actualResult).toBeDefined();
      expect(actualResult.workspace).toBeDefined();
      expect(actualResult.workspace.name).toBe('Studio Agronomico Rossi');
      expect(actualResult.workspace.slug).toBe('studio-agronomico-rossi');
      expect(actualResult.workspace.primaryColor).toBe('#ff0000');
      expect(actualResult.workspace.kind).toBe(WorkspaceKind.AGRICULTURAL);
      expect(actualResult.member).toBeDefined();
      expect(actualResult.member.role).toBe(WorkspaceRole.OWNER);

      const actualDbWorkspace = await workspaceRepository.findById(actualResult.workspace.id);
      expect(actualDbWorkspace).toBeDefined();
      expect(actualDbWorkspace?.name).toBe('Studio Agronomico Rossi');
    });

    it('should throw error when slug already exists', async () => {
      await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Test Workspace' },
        userId: testUserId,
      });

      await expect(
        createWorkspaceUseCase.execute({
          data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Test Workspace' },
          userId: testUserId,
        }),
      ).rejects.toThrow(AppError);
    });

    it('should allow custom slug', async () => {
      const actualResult = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'My Workspace', slug: 'custom-slug' },
        userId: testUserId,
      });

      expect(actualResult.workspace.slug).toBe('custom-slug');
    });

    it('should create workspace with MANUFACTURING kind', async () => {
      const actualResult = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.MANUFACTURING, name: 'Manufacturing Workspace' },
        userId: testUserId,
      });

      expect(actualResult.workspace.kind).toBe(WorkspaceKind.MANUFACTURING);
    });

    it('should reject create when kind is missing', async () => {
      await expect(
        createWorkspaceUseCase.execute({
          data: { name: 'Missing Kind Workspace' } as unknown as CreateWorkspaceDTO,
          userId: testUserId,
        }),
      ).rejects.toThrow(AppError);
    });

    it('should reject create when kind is invalid', async () => {
      await expect(
        createWorkspaceUseCase.execute({
          data: {
            name: 'Invalid Kind Workspace',
            kind: 'INVALID' as WorkspaceKind,
          },
          userId: testUserId,
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('GetWorkspaceUseCase', () => {
    it('should get workspace with counts', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Get Test Workspace' },
        userId: testUserId,
      });

      const actualResult = await getWorkspaceUseCase.execute({
        workspaceId: created.workspace.id,
        userId: testUserId,
      });

      expect(actualResult).toBeDefined();
      expect(actualResult.name).toBe('Get Test Workspace');
      expect(actualResult.kind).toBe(WorkspaceKind.AGRICULTURAL);
      expect(actualResult.membersCount).toBe(1);
      expect(actualResult.rulesCount).toBe(0);
    });

    it('should throw error for non-member', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Private Workspace' },
        userId: testUserId,
      });

      await expect(
        getWorkspaceUseCase.execute({
          workspaceId: created.workspace.id,
          userId: secondTestUserId,
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('ListUserWorkspacesUseCase', () => {
    it('should list all workspaces for user', async () => {
      await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Workspace 1' },
        userId: testUserId,
      });
      await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Workspace 2' },
        userId: testUserId,
      });

      const actualResult = await listUserWorkspacesUseCase.execute(testUserId);

      expect(actualResult).toHaveLength(2);
      expect(actualResult.map((w) => w.name)).toContain('Workspace 1');
      expect(actualResult.map((w) => w.name)).toContain('Workspace 2');
    });
  });});
