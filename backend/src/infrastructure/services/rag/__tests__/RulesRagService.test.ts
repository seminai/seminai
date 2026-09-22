import { RuleCategory, RuleStatus } from '@prisma/client';
import { RulesRagService } from '../RulesRagService';
import { Rule } from '../../../../domain/entities/Rule';
import { RuleOnCompany } from '../../../../domain/entities/RuleOnCompany';

const mockFindActiveByCompanyId = jest.fn();
const mockFindVectorizedByIds = jest.fn();
const mockFindVectorizedByWorkspaceId = jest.fn();
const mockSimilaritySearchWithScore = jest.fn();

jest.mock('../../../repositories/Prisma', () => ({ prisma: {} }));

jest.mock('../../../repositories/PrismaRuleOnCompanyRepository', () => ({
  PrismaRuleOnCompanyRepository: jest.fn(() => ({
    findActiveByCompanyId: mockFindActiveByCompanyId,
  })),
}));

jest.mock('../../../repositories/PrismaRuleRepository', () => ({
  PrismaRuleRepository: jest.fn(() => ({
    findVectorizedByIds: mockFindVectorizedByIds,
    findVectorizedByWorkspaceId: mockFindVectorizedByWorkspaceId,
  })),
}));

jest.mock('../../tool/vectorSearchQdrant', () => ({
  createVectorSearchQdrantService: jest.fn(() => ({
    similaritySearchWithScore: mockSimilaritySearchWithScore,
  })),
}));

describe('RulesRagService company multi-workspace search', () => {
  beforeEach(() => {
    mockFindActiveByCompanyId.mockReset();
    mockFindVectorizedByIds.mockReset();
    mockFindVectorizedByWorkspaceId.mockReset();
    mockSimilaritySearchWithScore.mockReset();
  });

  it('searches company-assigned rules across workspaces without workspace narrowing', async () => {
    const ruleA = createRule('rule-a', 'workspace-a');
    const ruleB = createRule('rule-b', 'workspace-b');
    mockFindActiveByCompanyId.mockResolvedValueOnce([
      createAssignment('assignment-a', 'rule-a'),
      createAssignment('assignment-b', 'rule-b'),
    ]);
    mockFindVectorizedByIds.mockResolvedValueOnce([ruleA, ruleB]);
    mockSimilaritySearchWithScore.mockResolvedValueOnce([
      [createDoc('rule-a'), 0.91],
      [createDoc('rule-b'), 0.89],
    ]);

    const actual = await new RulesRagService().queryRulesWithContext({
      workspaceId: 'workspace-a',
      companyId: 'company-1',
      query: 'certificazione bio',
      categories: [RuleCategory.CUSTOM],
    });
    const actualFilter = mockSimilaritySearchWithScore.mock.calls[0][2];

    expect(actual.map((result) => result.ruleId)).toEqual(['rule-a', 'rule-b']);
    expect(actual.every((result) => result.source === 'company')).toBe(true);
    expect(JSON.stringify(actualFilter)).not.toContain('metadata.workspaceId');
    expect(mockFindVectorizedByWorkspaceId).not.toHaveBeenCalled();
  });
});

function createDoc(ruleId: string) {
  return {
    pageContent: `chunk for ${ruleId}`,
    metadata: { ruleId, chunkIndex: 0 },
  };
}

function createRule(id: string, workspaceId: string): Rule {
  return new Rule(
    id,
    workspaceId,
    id,
    id,
    null,
    RuleCategory.CUSTOM,
    RuleStatus.ACTIVE,
    {},
    null,
    null,
    null,
    null,
    null,
    '1.0',
    false,
    false,
    'user-1',
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    'gs://rules/rule.pdf',
    'rule.pdf',
    null,
    'rules_knowledge_base',
    true,
    new Date('2026-01-01'),
    null,
  );
}

function createAssignment(id: string, ruleId: string): RuleOnCompany {
  return new RuleOnCompany(id, ruleId, 'company-1', true, 0, null, null, new Date(), 'user-1');
}
