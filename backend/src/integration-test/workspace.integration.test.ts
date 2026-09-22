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
import {
  prisma,
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteAllTestWorkspaces,
} from './helpers';
import { TEST_INVITE_CODE } from './constants';
import { CreateWorkspaceDTO } from '../domain/dtos/workspace.dto';
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
  let listUserWorkspacesUseCase: ListUserWorkspacesUseCase;
  let updateWorkspaceUseCase: UpdateWorkspaceUseCase;
  let deleteWorkspaceUseCase: DeleteWorkspaceUseCase;
  let inviteMemberUseCase: InviteMemberUseCase;
  let acceptInvitationUseCase: AcceptInvitationUseCase;
  let removeMemberUseCase: RemoveMemberUseCase;
  let updateMemberUseCase: UpdateMemberUseCase;
  let listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase;
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
  });
});
