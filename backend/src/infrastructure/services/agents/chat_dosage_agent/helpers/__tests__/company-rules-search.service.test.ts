const mockCompanyFindFirst = jest.fn();
const mockRuleOnCompanyFindFirst = jest.fn();
const mockWorkspaceMemberFindFirst = jest.fn();
const mockWorkspaceMemberFindMany = jest.fn();
const mockQueryRulesWithContext = jest.fn();

jest.mock('../../../../../repositories/Prisma', () => ({
  prisma: {
    company: { findFirst: (...args: unknown[]) => mockCompanyFindFirst(...args) },
    ruleOnCompany: { findFirst: (...args: unknown[]) => mockRuleOnCompanyFindFirst(...args) },
    workspaceMember: {
      findFirst: (...args: unknown[]) => mockWorkspaceMemberFindFirst(...args),
      findMany: (...args: unknown[]) => mockWorkspaceMemberFindMany(...args),
    },
  },
}));

jest.mock('../../../../rag/RulesRagService', () => ({
  RulesRagService: jest.fn(() => ({
    queryRulesWithContext: mockQueryRulesWithContext,
  })),
}));

import { searchRules } from '../company-rules-search.service';

describe('searchRules company assignment semantics', () => {
  beforeEach(() => {
    mockCompanyFindFirst.mockReset();
    mockRuleOnCompanyFindFirst.mockReset();
    mockWorkspaceMemberFindFirst.mockReset();
    mockWorkspaceMemberFindMany.mockReset();
    mockQueryRulesWithContext.mockReset();
  });

  it('does not include workspace rules by default when companyId is provided', async () => {
    mockCompanyFindFirst.mockResolvedValueOnce({ id: 'company-1' });
    mockQueryRulesWithContext.mockResolvedValueOnce([
      {
        ruleId: 'rule-1',
        ruleName: 'Assigned rule',
        category: 'CUSTOM',
        source: 'company',
        score: 0.9,
        relevantChunks: [],
        isCompliant: true,
        violations: [],
      },
    ]);

    const actualResults = await searchRules({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      companyId: 'company-1',
      query: 'bio certified rule',
    });

    expect(mockQueryRulesWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        companyId: 'company-1',
        includeWorkspaceRules: false,
      }),
    );
    expect(actualResults).toHaveLength(1);
    expect(actualResults[0].source).toBe('company');
  });

  it('rejects company searches when the user cannot access the company', async () => {
    mockCompanyFindFirst.mockResolvedValueOnce(null);

    const actualResults = await searchRules({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      companyId: 'company-1',
      query: 'private rule',
    });

    expect(actualResults).toEqual([]);
    expect(mockQueryRulesWithContext).not.toHaveBeenCalled();
  });
});
