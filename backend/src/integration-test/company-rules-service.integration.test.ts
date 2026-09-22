import { RuleCategory, RuleStatus } from '@prisma/client';
import { CompanyRulesService } from '../infrastructure/services/agents/dosage_agent/companyRulesService';
import type { InputDosageAgent } from '../infrastructure/services/agents/dosage_agent/types';
import {
  createTestCompany,
  createTestUser,
  createTestWorkspace,
  deleteAllTestWorkspaces,
  deleteTestCompany,
  deleteTestUser,
  prisma,
} from './helpers';

describe('CompanyRulesService Integration Tests', () => {
  let testUserId = '';
  let testWorkspaceId = '';
  let testCompanyId = '';

  beforeAll(async () => {
    const user = await createTestUser();
    testUserId = user.id;
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
    await prisma.ruleOnCompany.deleteMany({ where: { rule: { workspaceId: testWorkspaceId } } });
    await prisma.rule.deleteMany({ where: { workspaceId: testWorkspaceId } });
  });

  it('applies merged company rule config with priority and assignment overrides', async () => {
    const highPriorityRule = await prisma.rule.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'High Priority Dosage Rule',
        slug: 'high-priority-dosage-rule',
        category: RuleCategory.CUSTOM,
        status: RuleStatus.ACTIVE,
        content: {
          dosageAgent: {
            strategy: 'min',
            outStockLimiter: false,
            orchestrator: { maxProductsPerUnit: 2 },
          },
        },
        createdById: testUserId,
      },
    });
    const lowPriorityRule = await prisma.rule.create({
      data: {
        workspaceId: testWorkspaceId,
        name: 'Fallback Dosage Rule',
        slug: 'fallback-dosage-rule',
        category: RuleCategory.STANDARD,
        status: RuleStatus.ACTIVE,
        content: {
          dosageAgent: {
            strategy: 'max',
            outStockLimiter: true,
            orchestrator: {
              objective: 'balanced',
              maxApplicationsPerProductPerUnit: 3,
            },
          },
        },
        createdById: testUserId,
      },
    });

    await prisma.ruleOnCompany.create({
      data: {
        ruleId: lowPriorityRule.id,
        companyId: testCompanyId,
        priority: 5,
        overrides: {
          dosageAgent: {
            orchestrator: { maxApplicationsPerProductPerUnit: 4 },
          },
        },
        assignedById: testUserId,
      },
    });
    await prisma.ruleOnCompany.create({
      data: {
        ruleId: highPriorityRule.id,
        companyId: testCompanyId,
        priority: 0,
        assignedById: testUserId,
      },
    });

    const input: InputDosageAgent = {
      products: [],
      unitOfProduction: [],
      strategy: 'max',
      outStockLimiter: true,
    };
    const actualResult = await new CompanyRulesService().applyCompanyRulesWithDiagnostics({
      companyId: testCompanyId,
      input,
    });

    expect(actualResult.input.strategy).toBe('min');
    expect(actualResult.input.outStockLimiter).toBe(false);
    expect(actualResult.input.orchestrator?.objective).toBe('balanced');
    expect(actualResult.input.orchestrator?.maxProductsPerUnit).toBe(2);
    expect(actualResult.input.orchestrator?.maxApplicationsPerProductPerUnit).toBe(4);
    expect(actualResult.diagnostics.appliedRuleIds).toEqual([
      highPriorityRule.id,
      lowPriorityRule.id,
    ]);
    expect(actualResult.diagnostics.ignoredConflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: lowPriorityRule.id,
          keptRuleId: highPriorityRule.id,
          field: 'strategy',
        }),
      ]),
    );
  });
});
