import { PrismaRuleRepository } from '../infrastructure/repositories/PrismaRuleRepository';
import { PrismaRuleOnCompanyRepository } from '../infrastructure/repositories/PrismaRuleOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../infrastructure/repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../infrastructure/repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { CreateRuleUseCase } from '../application/use-cases/rule/CreateRuleUseCase';
import { GetRuleUseCase } from '../application/use-cases/rule/GetRuleUseCase';
import { ListRulesUseCase } from '../application/use-cases/rule/ListRulesUseCase';
import { UpdateRuleUseCase } from '../application/use-cases/rule/UpdateRuleUseCase';
import { DeleteRuleUseCase } from '../application/use-cases/rule/DeleteRuleUseCase';
import { AssignRuleToCompanyUseCase } from '../application/use-cases/rule/AssignRuleToCompanyUseCase';
import { UnassignRuleFromCompanyUseCase } from '../application/use-cases/rule/UnassignRuleFromCompanyUseCase';
import { ListCompanyRulesUseCase } from '../application/use-cases/rule/ListCompanyRulesUseCase';
import {
  prisma,
  createTestUser,
  deleteTestUser,
  deleteAllTestWorkspaces,
  createTestWorkspace,
  createTestCompany,
  deleteTestCompany,
} from './helpers';
import { AppError } from '../domain/errors/AppError';
import { RuleCategory, RuleStatus, WorkspaceKind, WorkspaceRole } from '@prisma/client';

describe('Rule Integration Tests', () => {
  let ruleRepository: PrismaRuleRepository;
  let ruleOnCompanyRepository: PrismaRuleOnCompanyRepository;
  let workspaceRepository: PrismaWorkspaceRepository;
  let workspaceMemberRepository: PrismaWorkspaceMemberRepository;
  let companyRepository: PrismaCompanyRepository;
  let createRuleUseCase: CreateRuleUseCase;
  let getRuleUseCase: GetRuleUseCase;
  let listRulesUseCase: ListRulesUseCase;
  let updateRuleUseCase: UpdateRuleUseCase;
  let deleteRuleUseCase: DeleteRuleUseCase;
  let assignRuleToCompanyUseCase: AssignRuleToCompanyUseCase;
  let unassignRuleFromCompanyUseCase: UnassignRuleFromCompanyUseCase;
  let listCompanyRulesUseCase: ListCompanyRulesUseCase;
  let testUserId: string;
  let testWorkspaceId: string;
  let testCompanyId: string;

  beforeAll(async () => {
    ruleRepository = new PrismaRuleRepository(prisma);
    ruleOnCompanyRepository = new PrismaRuleOnCompanyRepository(prisma);
    workspaceRepository = new PrismaWorkspaceRepository(prisma);
    workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
    companyRepository = new PrismaCompanyRepository(prisma);

    createRuleUseCase = new CreateRuleUseCase(
      ruleRepository,
      workspaceRepository,
      workspaceMemberRepository,
    );
    getRuleUseCase = new GetRuleUseCase(ruleRepository, workspaceMemberRepository);
    listRulesUseCase = new ListRulesUseCase(ruleRepository, workspaceMemberRepository);
    updateRuleUseCase = new UpdateRuleUseCase(ruleRepository, workspaceMemberRepository);
    deleteRuleUseCase = new DeleteRuleUseCase(ruleRepository, workspaceMemberRepository);
    assignRuleToCompanyUseCase = new AssignRuleToCompanyUseCase(
      ruleRepository,
      ruleOnCompanyRepository,
      workspaceRepository,
      workspaceMemberRepository,
      companyRepository,
    );
    unassignRuleFromCompanyUseCase = new UnassignRuleFromCompanyUseCase(
      ruleRepository,
      ruleOnCompanyRepository,
      workspaceMemberRepository,
      companyRepository,
    );
    listCompanyRulesUseCase = new ListCompanyRulesUseCase(
      ruleRepository,
      ruleOnCompanyRepository,
      companyRepository,
    );

    const testUser = await createTestUser();
    testUserId = testUser.id;

    const workspace = await createTestWorkspace({ userId: testUserId });
    testWorkspaceId = workspace.id;

    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id;
  });

  afterAll(async () => {
    await deleteTestCompany(testCompanyId);
    await deleteAllTestWorkspaces(testUserId);
    await deleteTestUser();
  });

  beforeEach(async () => {
    // Clean up rules before each test
    await prisma.ruleOnCrop.deleteMany({
      where: { rule: { workspaceId: testWorkspaceId } },
    });
    await prisma.ruleOnCompany.deleteMany({
      where: { rule: { workspaceId: testWorkspaceId } },
    });
    await prisma.rule.deleteMany({ where: { workspaceId: testWorkspaceId } });
  });

  describe('CreateRuleUseCase', () => {
    it('should create a rule successfully', async () => {
      const inputRuleData = {
        data: {
          workspaceId: testWorkspaceId,
          name: 'Disciplinare Emilia-Romagna Vite',
          category: RuleCategory.DISCIPLINARE,
          content: {
            maxDose: 100,
            unit: 'kg/ha',
            crops: ['vite'],
          },
          region: 'Emilia-Romagna',
          createdById: testUserId,
        },
      };

      const actualResult = await createRuleUseCase.execute(inputRuleData);

      expect(actualResult).toBeDefined();
      expect(actualResult.name).toBe('Disciplinare Emilia-Romagna Vite');
      expect(actualResult.slug).toBe('disciplinare-emilia-romagna-vite');
      expect(actualResult.category).toBe(RuleCategory.DISCIPLINARE);
      expect(actualResult.status).toBe(RuleStatus.DRAFT);
      expect(actualResult.region).toBe('Emilia-Romagna');

      const actualDbRule = await ruleRepository.findById(actualResult.id);
      expect(actualDbRule).toBeDefined();
      expect(actualDbRule?.name).toBe('Disciplinare Emilia-Romagna Vite');
    });

    it('should throw error when slug already exists in workspace', async () => {
      await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Test Rule',
          category: RuleCategory.CUSTOM,
          content: {},
          createdById: testUserId,
        },
      });

      await expect(
        createRuleUseCase.execute({
          data: {
            workspaceId: testWorkspaceId,
            name: 'Test Rule',
            category: RuleCategory.CUSTOM,
            content: {},
            createdById: testUserId,
          },
        }),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user has no permission', async () => {
      // Create a member without rule management permission
      const nonAdminUserId = 'non-admin-user-id';
      await prisma.user.create({
        data: {
          id: nonAdminUserId,
          email: 'nonadmin@test.com',
          password: 'hashed',
          name: 'Non Admin',
        },
      });
      await prisma.workspaceMember.create({
        data: {
          workspaceId: testWorkspaceId,
          userId: nonAdminUserId,
          role: WorkspaceRole.VIEWER,
          canManageRules: false,
          canInviteMembers: false,
        },
      });

      try {
        await expect(
          createRuleUseCase.execute({
            data: {
              workspaceId: testWorkspaceId,
              name: 'Unauthorized Rule',
              category: RuleCategory.CUSTOM,
              content: {},
              createdById: nonAdminUserId,
            },
          }),
        ).rejects.toThrow(AppError);
      } finally {
        await prisma.workspaceMember.deleteMany({ where: { userId: nonAdminUserId } });
        await prisma.user.delete({ where: { id: nonAdminUserId } });
      }
    });
  });

  describe('GetRuleUseCase', () => {
    it('should get rule with counts', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Get Test Rule',
          category: RuleCategory.STANDARD,
          content: { version: '1.0' },
          createdById: testUserId,
        },
      });

      const actualResult = await getRuleUseCase.execute({
        ruleId: rule.id,
        userId: testUserId,
      });

      expect(actualResult).toBeDefined();
      expect(actualResult.name).toBe('Get Test Rule');
      expect(actualResult.companiesCount).toBe(0);
      expect(actualResult.cropsCount).toBe(0);
    });

    it('should allow viewing public rules by non-member', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Public Rule',
          category: RuleCategory.DISCIPLINARE,
          content: {},
          isPublic: true,
          createdById: testUserId,
        },
      });

      // Create a user who is not a member
      const outsiderUserId = 'outsider-user';
      await prisma.user.create({
        data: {
          id: outsiderUserId,
          email: 'outsider@test.com',
          password: 'hashed',
          name: 'Outsider',
        },
      });

      try {
        const actualResult = await getRuleUseCase.execute({
          ruleId: rule.id,
          userId: outsiderUserId,
        });

        expect(actualResult).toBeDefined();
        expect(actualResult.name).toBe('Public Rule');
      } finally {
        await prisma.user.delete({ where: { id: outsiderUserId } });
      }
    });
  });

  describe('ListRulesUseCase', () => {
    it('should list all rules in workspace', async () => {
      await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Rule 1',
          category: RuleCategory.DISCIPLINARE,
          content: {},
          createdById: testUserId,
        },
      });
      await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Rule 2',
          category: RuleCategory.STANDARD,
          content: {},
          createdById: testUserId,
        },
      });

      const actualResult = await listRulesUseCase.execute({
        workspaceId: testWorkspaceId,
        userId: testUserId,
      });

      expect(actualResult).toHaveLength(2);
    });

    it('should filter rules by category', async () => {
      await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Disciplinare 1',
          category: RuleCategory.DISCIPLINARE,
          content: {},
          createdById: testUserId,
        },
      });
      await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Standard 1',
          category: RuleCategory.STANDARD,
          content: {},
          createdById: testUserId,
        },
      });

      const actualResult = await listRulesUseCase.execute({
        workspaceId: testWorkspaceId,
        userId: testUserId,
        filters: { category: RuleCategory.DISCIPLINARE },
      });

      expect(actualResult).toHaveLength(1);
      expect(actualResult[0].name).toBe('Disciplinare 1');
    });
  });

  describe('UpdateRuleUseCase', () => {
    it('should update rule successfully', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Original Rule',
          category: RuleCategory.CUSTOM,
          content: { v: 1 },
          createdById: testUserId,
        },
      });

      const actualResult = await updateRuleUseCase.execute({
        ruleId: rule.id,
        userId: testUserId,
        data: {
          name: 'Updated Rule',
          status: RuleStatus.ACTIVE,
          content: { v: 2 },
        },
      });

      expect(actualResult.name).toBe('Updated Rule');
      expect(actualResult.status).toBe(RuleStatus.ACTIVE);
    });
  });

  describe('DeleteRuleUseCase', () => {
    it('should delete rule successfully', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'To Delete',
          category: RuleCategory.CUSTOM,
          content: {},
          createdById: testUserId,
        },
      });

      await deleteRuleUseCase.execute({
        ruleId: rule.id,
        userId: testUserId,
      });

      const actualDbRule = await ruleRepository.findById(rule.id);
      expect(actualDbRule).toBeNull();
    });
  });

  describe('AssignRuleToCompanyUseCase', () => {
    it('should assign rule to company successfully', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Assignable Rule',
          category: RuleCategory.DISCIPLINARE,
          content: {},
          createdById: testUserId,
        },
      });

      const actualAssignment = await assignRuleToCompanyUseCase.execute({
        data: {
          ruleId: rule.id,
          companyId: testCompanyId,
          priority: 1,
          notes: 'Assegnazione test',
          assignedById: testUserId,
        },
      });

      expect(actualAssignment).toBeDefined();
      expect(actualAssignment.ruleId).toBe(rule.id);
      expect(actualAssignment.companyId).toBe(testCompanyId);
      expect(actualAssignment.priority).toBe(1);
      expect(actualAssignment.isActive).toBe(true);
    });

    it('should throw error when already assigned', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Already Assigned Rule',
          category: RuleCategory.STANDARD,
          content: {},
          createdById: testUserId,
        },
      });

      await assignRuleToCompanyUseCase.execute({
        data: {
          ruleId: rule.id,
          companyId: testCompanyId,
          assignedById: testUserId,
        },
      });

      await expect(
        assignRuleToCompanyUseCase.execute({
          data: {
            ruleId: rule.id,
            companyId: testCompanyId,
            assignedById: testUserId,
          },
        }),
      ).rejects.toThrow(AppError);
    });

    it('should reject assignment when company kind mismatches workspace kind', async () => {
      const manufacturingWorkspace = await createTestWorkspace({
        userId: testUserId,
        name: 'Manufacturing Workspace',
        kind: WorkspaceKind.MANUFACTURING,
      });

      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: manufacturingWorkspace.id,
          name: 'Manufacturing Rule',
          category: RuleCategory.STANDARD,
          content: {},
          createdById: testUserId,
        },
      });

      await expect(
        assignRuleToCompanyUseCase.execute({
          data: {
            ruleId: rule.id,
            companyId: testCompanyId,
            assignedById: testUserId,
          },
        }),
      ).rejects.toMatchObject({
        code: 'COMPANY_KIND_WORKSPACE_MISMATCH',
      });

      await prisma.ruleOnCompany.deleteMany({ where: { ruleId: rule.id } });
      await prisma.rule.delete({ where: { id: rule.id } });
      await prisma.workspaceMember.deleteMany({
        where: { workspaceId: manufacturingWorkspace.id },
      });
      await prisma.workspace.delete({ where: { id: manufacturingWorkspace.id } });
    });
  });

  describe('UnassignRuleFromCompanyUseCase', () => {
    it('should unassign rule from company', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Unassign Rule',
          category: RuleCategory.METHODOLOGY,
          content: {},
          createdById: testUserId,
        },
      });

      await assignRuleToCompanyUseCase.execute({
        data: {
          ruleId: rule.id,
          companyId: testCompanyId,
          assignedById: testUserId,
        },
      });

      await unassignRuleFromCompanyUseCase.execute({
        ruleId: rule.id,
        companyId: testCompanyId,
        userId: testUserId,
      });

      const actualAssignment = await ruleOnCompanyRepository.findByRuleAndCompany(
        rule.id,
        testCompanyId,
      );
      expect(actualAssignment).toBeNull();
    });
  });

  describe('ListCompanyRulesUseCase', () => {
    it('should list all rules assigned to company', async () => {
      const rule1 = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Company Rule 1',
          category: RuleCategory.DISCIPLINARE,
          content: {},
          createdById: testUserId,
        },
      });
      const rule2 = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Company Rule 2',
          category: RuleCategory.STANDARD,
          content: {},
          createdById: testUserId,
        },
      });

      await assignRuleToCompanyUseCase.execute({
        data: {
          ruleId: rule1.id,
          companyId: testCompanyId,
          priority: 2,
          assignedById: testUserId,
        },
      });
      await assignRuleToCompanyUseCase.execute({
        data: {
          ruleId: rule2.id,
          companyId: testCompanyId,
          priority: 1,
          assignedById: testUserId,
        },
      });

      const actualResult = await listCompanyRulesUseCase.execute({
        companyId: testCompanyId,
        userId: testUserId,
      });

      expect(actualResult).toHaveLength(2);
      // Should be sorted by priority
      expect(actualResult[0].priority).toBe(1);
      expect(actualResult[1].priority).toBe(2);
    });

    it('should filter only active assignments', async () => {
      const rule = await createRuleUseCase.execute({
        data: {
          workspaceId: testWorkspaceId,
          name: 'Inactive Rule',
          category: RuleCategory.BEST_PRACTICE,
          content: {},
          createdById: testUserId,
        },
      });

      const assignment = await assignRuleToCompanyUseCase.execute({
        data: {
          ruleId: rule.id,
          companyId: testCompanyId,
          assignedById: testUserId,
        },
      });

      // Deactivate the assignment
      await ruleOnCompanyRepository.update(assignment.id, { isActive: false });

      const actualResult = await listCompanyRulesUseCase.execute({
        companyId: testCompanyId,
        userId: testUserId,
        onlyActive: true,
      });

      expect(actualResult).toHaveLength(0);
    });
  });
});
