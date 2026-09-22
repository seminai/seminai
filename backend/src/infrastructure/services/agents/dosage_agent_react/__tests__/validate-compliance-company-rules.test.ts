const mockFlowValidateRulesCompliance = jest.fn();
const mockGetVectorizedRulesForCompany = jest.fn();

jest.mock('../../dosage_agent/flowValidateRulesCompliance', () => ({
  flowValidateRulesCompliance: (...args: unknown[]) => mockFlowValidateRulesCompliance(...args),
}));

jest.mock('../../dosage_agent/companyRulesService', () => ({
  CompanyRulesService: jest.fn(() => ({
    getVectorizedRulesForCompany: mockGetVectorizedRulesForCompany,
  })),
}));

import { createValidateComplianceTool } from '../tools/validate-compliance.tool';
import { clearWorkingMemory, updateWorkingMemory } from '../working-memory';

const threadId = 'thread-rules-compliance';

describe('validate_compliance company rules', () => {
  beforeEach(() => {
    clearWorkingMemory(threadId);
    mockFlowValidateRulesCompliance.mockReset();
    mockGetVectorizedRulesForCompany.mockReset();
  });

  afterEach(() => {
    clearWorkingMemory(threadId);
  });

  it('resolves companyId from inputUnits and validates only assigned company rules', async () => {
    const dosageResults = [
      { unitProductionId: 'unit-1', cropName: 'Melo', products: [], jobs: [] },
    ];
    updateWorkingMemory(threadId, {
      inputUnits: [{ id: 'unit-1', companyId: 'company-1' }],
      dosageResults,
    });
    mockGetVectorizedRulesForCompany.mockResolvedValueOnce([{ id: 'rule-1', workspaceId: 'ws-1' }]);
    mockFlowValidateRulesCompliance.mockResolvedValueOnce({
      output: dosageResults,
      violations: [],
      disciplinareInfoMap: new Map(),
      appliedRulesByProduct: new Map(),
    });

    const tool = createValidateComplianceTool(threadId, undefined, 'user-1');
    const raw = await tool.func({});
    const actualOutput = JSON.parse(raw as string);
    const actualContext = mockFlowValidateRulesCompliance.mock.calls[0][0];

    expect(mockGetVectorizedRulesForCompany).toHaveBeenCalledWith('company-1');
    expect(actualContext).toMatchObject({
      jobId: `react-${threadId}`,
      userId: 'user-1',
      companyId: 'company-1',
    });
    expect(actualOutput.status).toBe('VALIDATED');
    expect(actualOutput.rulesApplied).toBe(1);
    expect(actualOutput.companyContextSource).toBe('inputUnits');
  });

  it('returns da verificare when no applicable vectorized company rules exist', async () => {
    updateWorkingMemory(threadId, {
      inputUnits: [{ id: 'unit-1', companyId: 'company-1' }],
      dosageResults: [{ unitProductionId: 'unit-1', cropName: 'Melo', products: [], jobs: [] }],
    });
    mockGetVectorizedRulesForCompany.mockResolvedValueOnce([]);

    const tool = createValidateComplianceTool(threadId, undefined, 'user-1');
    const raw = await tool.func({});
    const actualOutput = JSON.parse(raw as string);

    expect(actualOutput.status).toBe('NO_APPLICABLE_RULES');
    expect(actualOutput.verdict).toContain('DA VERIFICARE');
    expect(actualOutput.verdict).not.toContain('CONFORME');
    expect(mockFlowValidateRulesCompliance).not.toHaveBeenCalled();
  });
});
