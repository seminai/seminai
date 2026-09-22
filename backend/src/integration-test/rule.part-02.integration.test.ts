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
import { RuleCategory, RuleStatus } from '@prisma/client';
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
  let updateRuleUseCase: UpdateRuleUseCase;
  let deleteRuleUseCase: DeleteRuleUseCase;
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
  });});
