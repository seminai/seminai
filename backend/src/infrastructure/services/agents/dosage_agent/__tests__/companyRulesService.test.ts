import { Prisma, RuleCategory, RuleStatus } from '@prisma/client';
import { CompanyRulesService } from '../companyRulesService';
import { Rule } from '../../../../../domain/entities/Rule';
import { RuleOnCompany } from '../../../../../domain/entities/RuleOnCompany';

const mockFindActiveByCompanyId = jest.fn();
const mockFindRuleById = jest.fn();

jest.mock('../../../../repositories/Prisma', () => ({ prisma: {} }));

jest.mock('../../../../repositories/PrismaRuleOnCompanyRepository', () => ({
  PrismaRuleOnCompanyRepository: jest.fn(() => ({
    findActiveByCompanyId: mockFindActiveByCompanyId,
  })),
}));

jest.mock('../../../../repositories/PrismaRuleRepository', () => ({
  PrismaRuleRepository: jest.fn(() => ({
    findById: mockFindRuleById,
  })),
}));

describe('CompanyRulesService priority merge', () => {
  beforeEach(() => {
    mockFindActiveByCompanyId.mockReset();
    mockFindRuleById.mockReset();
  });

  it('merges all valid rules by priority and records ignored conflicts', async () => {
    const high = createRule('rule-high', { strategy: 'min', maxProductsPerUnit: 2 });
    const low = createRule('rule-low', {
      strategy: 'max',
      outStockLimiter: true,
      objective: 'balanced',
      maxDosi: 3,
    });
    mockFindActiveByCompanyId.mockResolvedValueOnce([
      createAssignment('ass-low', 'rule-low', 10),
      createAssignment('ass-high', 'rule-high', 0),
    ]);
    mockFindRuleById.mockImplementation((id: string) =>
      Promise.resolve(id === 'rule-high' ? high : low),
    );

    const actual = await new CompanyRulesService().applyCompanyRulesWithDiagnostics({
      companyId: 'company-1',
      input: createInput(),
    });

    expect(actual.input.strategy).toBe('min');
    expect(actual.input.outStockLimiter).toBe(true);
    expect(actual.input.orchestrator?.maxProductsPerUnit).toBe(2);
    expect(actual.input.orchestrator?.objective).toBe('balanced');
    expect(actual.input.orchestrator?.maxApplicationsPerProductPerUnit).toBe(3);
    expect(actual.diagnostics.appliedRuleIds).toEqual(['rule-high', 'rule-low']);
    expect(actual.diagnostics.ignoredConflicts).toEqual([
      expect.objectContaining({ ruleId: 'rule-low', field: 'strategy', keptRuleId: 'rule-high' }),
    ]);
  });

  it('lets assignment overrides win before cross-rule priority merge', async () => {
    const rule = createRule('rule-1', {
      strategy: 'avg',
      orchestrator: { objective: 'balanced', maxApplicationsPerProductPerUnit: 1 },
    });
    const assignment = createAssignment('ass-1', 'rule-1', 0, {
      dosageAgent: {
        strategy: 'max',
        orchestrator: { maxApplicationsPerProductPerUnit: 2 },
      },
    });
    mockFindActiveByCompanyId.mockResolvedValueOnce([assignment]);
    mockFindRuleById.mockResolvedValueOnce(rule);

    const actual = await new CompanyRulesService().applyCompanyRulesWithDiagnostics({
      companyId: 'company-1',
      input: createInput(),
    });

    expect(actual.input.strategy).toBe('max');
    expect(actual.input.orchestrator?.objective).toBe('balanced');
    expect(actual.input.orchestrator?.maxApplicationsPerProductPerUnit).toBe(2);
    expect(actual.diagnostics.ignoredConflicts).toEqual([]);
  });

  it('ignores inactive status and invalid date rules', async () => {
    const inactive = createRule('rule-inactive', { strategy: 'min' }, RuleStatus.DRAFT);
    const future = createRule('rule-future', { outStockLimiter: true }, RuleStatus.ACTIVE, {
      validFrom: new Date('2999-01-01'),
    });
    mockFindActiveByCompanyId.mockResolvedValueOnce([
      createAssignment('ass-1', 'rule-inactive', 0),
      createAssignment('ass-2', 'rule-future', 1),
    ]);
    mockFindRuleById.mockImplementation((id: string) =>
      Promise.resolve(id === 'rule-inactive' ? inactive : future),
    );

    const actual = await new CompanyRulesService().applyCompanyRulesWithDiagnostics({
      companyId: 'company-1',
      input: createInput(),
    });

    expect(actual.input).toEqual(createInput());
    expect(actual.diagnostics.appliedRuleIds).toEqual([]);
  });
});

function createInput() {
  return {
    products: [],
    unitOfProduction: [],
  };
}

function createRule(
  id: string,
  dosageAgent: Prisma.JsonObject,
  status: RuleStatus = RuleStatus.ACTIVE,
  dates: { readonly validFrom?: Date; readonly validUntil?: Date } = {},
): Rule {
  return new Rule(
    id,
    'workspace-1',
    id,
    id,
    null,
    RuleCategory.CUSTOM,
    status,
    { dosageAgent },
    null,
    null,
    null,
    dates.validFrom ?? null,
    dates.validUntil ?? null,
    '1.0',
    false,
    false,
    'user-1',
    new Date('2026-01-01'),
    new Date('2026-01-01'),
  );
}

function createAssignment(
  id: string,
  ruleId: string,
  priority: number,
  overrides: Prisma.JsonObject | null = null,
): RuleOnCompany {
  return new RuleOnCompany(
    id,
    ruleId,
    'company-1',
    true,
    priority,
    overrides,
    null,
    new Date(),
    'user-1',
  );
}
