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
import { RuleCategory, WorkspaceKind } from '@prisma/client';
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
  });});
