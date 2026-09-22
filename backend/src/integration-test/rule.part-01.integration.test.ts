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
import { prisma, createTestUser, deleteTestUser, deleteAllTestWorkspaces, createTestWorkspace, createTestCompany, deleteTestCompany } from './helpers';
import { AppError } from '../domain/errors/AppError';
import { RuleCategory, RuleStatus, WorkspaceRole } from '@prisma/client';
describe('Rule Integration Tests', () => {
  let ruleRepository: PrismaRuleRepository;
  let ruleOnCompanyRepository: PrismaRuleOnCompanyRepository;
  let workspaceRepository: PrismaWorkspaceRepository;
  let workspaceMemberRepository: PrismaWorkspaceMemberRepository;
  let companyRepository: PrismaCompanyRepository;
  let createRuleUseCase: CreateRuleUseCase;
  let getRuleUseCase: GetRuleUseCase;
  let listRulesUseCase: ListRulesUseCase;
void (() => listRulesUseCase);
  let updateRuleUseCase: UpdateRuleUseCase;
void (() => updateRuleUseCase);
  let deleteRuleUseCase: DeleteRuleUseCase;
void (() => deleteRuleUseCase);
  let assignRuleToCompanyUseCase: AssignRuleToCompanyUseCase;
void (() => assignRuleToCompanyUseCase);
  let unassignRuleFromCompanyUseCase: UnassignRuleFromCompanyUseCase;
void (() => unassignRuleFromCompanyUseCase);
  let listCompanyRulesUseCase: ListCompanyRulesUseCase;
void (() => listCompanyRulesUseCase);
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
  });});
