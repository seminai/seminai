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
import { resolveWorkspaceCompanyScope } from '../application/services/workspace/resolve-workspace-company-scope';
import { prisma, createTestUser, createTestCompany, deleteTestUser, deleteAllTestWorkspaces } from './helpers';
import { TEST_INVITE_CODE } from './constants';
import { WorkspaceKind } from '@prisma/client';
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
void (() => removeMemberUseCase);
  let updateMemberUseCase: UpdateMemberUseCase;
void (() => updateMemberUseCase);
  let listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase;
void (() => listWorkspaceMembersUseCase);
  let listWorkspaceCompaniesUseCase: ListWorkspaceCompaniesUseCase;
  let replaceWorkspaceCompaniesUseCase: ReplaceWorkspaceCompaniesUseCase;
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

  describe('Workspace company assignments', () => {
    it('should assign companies at creation and scope the company list', async () => {
      const companyA = await createTestCompany({ userId: testUserId, name: 'Scoped Company A' });
      const companyB = await createTestCompany({ userId: testUserId, name: 'Scoped Company B' });

      const created = await createWorkspaceUseCase.execute({
        data: {
          kind: WorkspaceKind.AGRICULTURAL,
          name: 'Scoped Workspace',
          companyIds: [companyA.id],
        },
        userId: testUserId,
      });

      const listed = await listWorkspaceCompaniesUseCase.execute({
        workspaceId: created.workspace.id,
        userId: testUserId,
      });
      expect(listed.companies).toHaveLength(1);
      expect(listed.companies[0]?.companyId).toBe(companyA.id);

      const scoped = await resolveWorkspaceCompanyScope({
        userId: testUserId,
        workspaceId: created.workspace.id,
        companyRepository,
        companyOnWorkspaceRepository,
        workspaceMemberRepository,
      });
      expect(scoped.map((company) => company.id)).toEqual([companyA.id]);
      expect(scoped.some((company) => company.id === companyB.id)).toBe(false);
    });

    it('should return all user companies when no assignments exist', async () => {
      const created = await createWorkspaceUseCase.execute({
        data: { kind: WorkspaceKind.AGRICULTURAL, name: 'Unscoped Workspace' },
        userId: testUserId,
      });

      const allCompanies = await companyRepository.findManyByUserId(testUserId);
      const scoped = await resolveWorkspaceCompanyScope({
        userId: testUserId,
        workspaceId: created.workspace.id,
        companyRepository,
        companyOnWorkspaceRepository,
        workspaceMemberRepository,
      });

      expect(scoped.length).toBeGreaterThanOrEqual(allCompanies.length);
    });

    it('should replace workspace company assignments', async () => {
      const companyA = await createTestCompany({ userId: testUserId, name: 'Replace Company A' });
      const companyB = await createTestCompany({ userId: testUserId, name: 'Replace Company B' });
      const created = await createWorkspaceUseCase.execute({
        data: {
          kind: WorkspaceKind.AGRICULTURAL,
          name: 'Replace Assignments Workspace',
          companyIds: [companyA.id],
        },
        userId: testUserId,
      });

      const replaced = await replaceWorkspaceCompaniesUseCase.execute({
        workspaceId: created.workspace.id,
        userId: testUserId,
        companyIds: [companyB.id],
      });

      expect(replaced.companies).toHaveLength(1);
      expect(replaced.companies[0]?.companyId).toBe(companyB.id);
    });
  });});
