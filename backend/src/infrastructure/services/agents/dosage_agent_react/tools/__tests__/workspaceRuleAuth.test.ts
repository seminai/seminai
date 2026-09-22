/**
 * Unit tests for the workspace authorization gate added to the 4 workspace-rule
 * tools (PR-B of P2). Defense-in-depth at the tool layer: a foreign workspaceId
 * must be rejected BEFORE the use case is invoked.
 */
import { createCreateWorkspaceRuleTool } from '../create-workspace-rule.tool';
import { createListWorkspaceRulesTool } from '../list-workspace-rules.tool';
import { createUpdateWorkspaceRuleTool } from '../update-workspace-rule.tool';
import { createArchiveWorkspaceRuleTool } from '../archive-workspace-rule.tool';
import { assertWorkspaceAccess } from '../../../shared/authorization';

const mockCreateRuleExecute = jest.fn();
const mockUpdateRuleExecute = jest.fn();
const mockListRulesExecute = jest.fn();
const mockRuleFindById = jest.fn();
const mockPrismaRuleFindUnique = jest.fn();

jest.mock('../../../shared/authorization', () => ({
  assertCompanyAccess: jest.fn().mockResolvedValue(undefined),
  assertFieldAccess: jest.fn().mockResolvedValue(undefined),
  assertFieldsAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitsAccess: jest.fn().mockResolvedValue(undefined),
  assertWorkspaceAccess: jest.fn(),
}));

jest.mock('../../../../../repositories/Prisma', () => ({
  prisma: {
    rule: { findUnique: (...args: unknown[]) => mockPrismaRuleFindUnique(...args) },
  },
}));

jest.mock('../../../../../../application/use-cases/rule/CreateRuleUseCase', () => ({
  CreateRuleUseCase: jest.fn(() => ({ execute: mockCreateRuleExecute })),
}));

jest.mock('../../../../../../application/use-cases/rule/UpdateRuleUseCase', () => ({
  UpdateRuleUseCase: jest.fn(() => ({ execute: mockUpdateRuleExecute })),
}));

jest.mock('../../../../../../application/use-cases/rule/ListRulesUseCase', () => ({
  ListRulesUseCase: jest.fn(() => ({ execute: mockListRulesExecute })),
}));

jest.mock('../../../../../repositories/PrismaRuleRepository', () => ({
  PrismaRuleRepository: jest.fn(() => ({ findById: mockRuleFindById })),
}));

jest.mock('../../../../../repositories/PrismaWorkspaceRepository', () => ({
  PrismaWorkspaceRepository: jest.fn(() => ({})),
}));

jest.mock('../../../../../repositories/PrismaWorkspaceMemberRepository', () => ({
  PrismaWorkspaceMemberRepository: jest.fn(() => ({})),
}));

const mockedAssertWorkspaceAccess = assertWorkspaceAccess as jest.MockedFunction<
  typeof assertWorkspaceAccess
>;

describe('workspace-rule tools — assertWorkspaceAccess gate (PR-B)', () => {
  beforeEach(() => {
    mockedAssertWorkspaceAccess.mockReset();
    mockCreateRuleExecute.mockReset();
    mockUpdateRuleExecute.mockReset();
    mockListRulesExecute.mockReset();
    mockRuleFindById.mockReset();
    mockPrismaRuleFindUnique.mockReset();
  });

  it('create_workspace_rule: foreign workspaceId is rejected before CreateRuleUseCase runs', async () => {
    mockedAssertWorkspaceAccess.mockRejectedValueOnce(
      new Error('Workspace non trovato o non autorizzato per questo utente.'),
    );

    const tool = createCreateWorkspaceRuleTool('thread-1', 'user-1');
    const raw = await tool.func({
      workspaceId: 'foreign-ws',
      name: 'X',
      category: 'STANDARD',
      content: {},
      uploadPdfFromChat: false,
    });

    const out = JSON.parse(raw as string);
    expect(out.error).toMatch(/Workspace non trovato/);
    expect(mockedAssertWorkspaceAccess).toHaveBeenCalledWith('user-1', 'foreign-ws');
    expect(mockCreateRuleExecute).not.toHaveBeenCalled();
  });

  it('list_workspace_rules: foreign workspaceId is rejected before ListRulesUseCase runs', async () => {
    mockedAssertWorkspaceAccess.mockRejectedValueOnce(
      new Error('Workspace non trovato o non autorizzato per questo utente.'),
    );

    const tool = createListWorkspaceRulesTool('user-1');
    const raw = await tool.func({ workspaceId: 'foreign-ws' });

    const out = JSON.parse(raw as string);
    expect(out.error).toMatch(/Workspace non trovato/);
    expect(mockedAssertWorkspaceAccess).toHaveBeenCalledWith('user-1', 'foreign-ws');
    expect(mockListRulesExecute).not.toHaveBeenCalled();
  });

  it('update_workspace_rule: ruleId resolving to foreign workspaceId is rejected', async () => {
    mockPrismaRuleFindUnique.mockResolvedValueOnce({ workspaceId: 'foreign-ws' });
    mockedAssertWorkspaceAccess.mockRejectedValueOnce(
      new Error('Workspace non trovato o non autorizzato per questo utente.'),
    );

    const tool = createUpdateWorkspaceRuleTool('thread-1', 'user-1');
    const raw = await tool.func({
      ruleId: 'rule-foreign',
      replacePdfFromChat: false,
    });

    const out = JSON.parse(raw as string);
    expect(out.error).toMatch(/Workspace non trovato/);
    expect(mockedAssertWorkspaceAccess).toHaveBeenCalledWith('user-1', 'foreign-ws');
    expect(mockUpdateRuleExecute).not.toHaveBeenCalled();
  });

  it('archive_workspace_rule: existing rule in foreign workspace is rejected without extra query', async () => {
    mockRuleFindById.mockResolvedValueOnce({
      id: 'rule-foreign',
      workspaceId: 'foreign-ws',
      name: 'Foreign Rule',
      status: 'ACTIVE',
    });
    mockedAssertWorkspaceAccess.mockRejectedValueOnce(
      new Error('Workspace non trovato o non autorizzato per questo utente.'),
    );

    const tool = createArchiveWorkspaceRuleTool('user-1');
    const raw = await tool.func({ ruleId: 'rule-foreign' });

    const out = JSON.parse(raw as string);
    expect(out.error).toMatch(/Workspace non trovato/);
    expect(mockRuleFindById).toHaveBeenCalledTimes(1); // reused, no extra query
    expect(mockPrismaRuleFindUnique).not.toHaveBeenCalled();
    expect(mockedAssertWorkspaceAccess).toHaveBeenCalledWith('user-1', 'foreign-ws');
    expect(mockUpdateRuleExecute).not.toHaveBeenCalled();
  });
});
