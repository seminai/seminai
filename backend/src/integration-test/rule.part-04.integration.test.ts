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
import { RuleCategory } from '@prisma/client';
describe('Rule Integration Tests', () => {
  let ruleRepository: PrismaRuleRepository;
  let ruleOnCompanyRepository: PrismaRuleOnCompanyRepository;
  let workspaceRepository: PrismaWorkspaceRepository;
  let workspaceMemberRepository: PrismaWorkspaceMemberRepository;
  let companyRepository: PrismaCompanyRepository;
  let createRuleUseCase: CreateRuleUseCase;
  let getRuleUseCase: GetRuleUseCase;
void (() => getRuleUseCase);
  let listRulesUseCase: ListRulesUseCase;
void (() => listRulesUseCase);
  let updateRuleUseCase: UpdateRuleUseCase;
void (() => updateRuleUseCase);
  let deleteRuleUseCase: DeleteRuleUseCase;
void (() => deleteRuleUseCase);
  let assignRuleToCompanyUseCase: AssignRuleToCompanyUseCase;
  let unassignRuleFromCompanyUseCase: UnassignRuleFromCompanyUseCase;
void (() => unassignRuleFromCompanyUseCase);
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
  });});
