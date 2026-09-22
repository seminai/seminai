const mockFlowMatchCropTreatment = jest.fn();
const mockFlowMatchDosage = jest.fn();
const mockApplyCompanyRulesWithDiagnostics = jest.fn();

jest.mock('../../dosage_agent/flowMatchCropTreatment', () => ({
  flowMatchCropTreatment: (...args: unknown[]) => mockFlowMatchCropTreatment(...args),
}));

jest.mock('../../dosage_agent/flowMatchProductionUnitTreatmentDosage', () => ({
  flowMatchProductionUnitTreatmentDosageV2: (...args: unknown[]) => mockFlowMatchDosage(...args),
}));

jest.mock('../../dosage_agent/companyRulesService', () => ({
  CompanyRulesService: jest.fn(() => ({
    applyCompanyRulesWithDiagnostics: mockApplyCompanyRulesWithDiagnostics,
  })),
}));

import { createCalculateDosageTool } from '../tools/calculate-dosage.tool';
import { clearWorkingMemory, getWorkingMemory, updateWorkingMemory } from '../working-memory';
import type { InputDosageAgent } from '../../dosage_agent/types';

const threadId = 'thread-calculate-cache';

describe('calculate_dosage smart cache invalidation', () => {
  beforeEach(() => {
    clearWorkingMemory(threadId);
    mockFlowMatchCropTreatment.mockReset();
    mockFlowMatchDosage.mockReset();
    mockApplyCompanyRulesWithDiagnostics.mockReset();
    mockFlowMatchCropTreatment.mockResolvedValue([createMatchedUnit()]);
    mockFlowMatchDosage.mockResolvedValue([createDosageUnit()]);
    mockApplyCompanyRulesWithDiagnostics.mockImplementation(({ input }) =>
      Promise.resolve({ input, diagnostics: createDiagnostics(null) }),
    );
  });

  afterEach(() => clearWorkingMemory(threadId));

  it('reuses matchedProducts when the dosage context fingerprint is unchanged', async () => {
    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Prodotto', registrationNumber: '123', quantity: 1 }],
      inputUnits: [{ id: 'unit-1', cropName: 'Melo', companyId: 'company-1' }],
    });
    const tool = createCalculateDosageTool(threadId, undefined, 'user-1');

    await tool.func({ strategy: 'avg', outStockLimiter: false });
    mockFlowMatchCropTreatment.mockClear();
    await tool.func({ strategy: 'avg', outStockLimiter: false });

    expect(mockFlowMatchCropTreatment).not.toHaveBeenCalled();
    expect(getWorkingMemory(threadId).matchedProductsDosageContextFingerprint).toBeTruthy();
  });

  it('invalidates matchedProducts when effective rule config changes', async () => {
    updateWorkingMemory(threadId, {
      inputProducts: [{ productName: 'Prodotto', registrationNumber: '123', quantity: 1 }],
      inputUnits: [{ id: 'unit-1', cropName: 'Melo', companyId: 'company-1' }],
    });
    const tool = createCalculateDosageTool(threadId, undefined, 'user-1');

    await tool.func({ strategy: 'avg', outStockLimiter: false });
    mockFlowMatchCropTreatment.mockClear();
    mockApplyCompanyRulesWithDiagnostics.mockImplementation(
      ({ input }: { input: InputDosageAgent }) =>
        Promise.resolve({
          input: { ...input, outStockLimiter: true },
          diagnostics: createDiagnostics({ outStockLimiter: true }),
        }),
    );
    const raw = await tool.func({ strategy: 'avg', outStockLimiter: false });
    const actual = JSON.parse(raw as string);

    expect(mockFlowMatchCropTreatment).toHaveBeenCalledTimes(1);
    expect(actual.matchedProductsInvalidated).toBe(true);
  });
});

function createDiagnostics(finalConfig: unknown) {
  return {
    appliedRuleIds: finalConfig ? ['rule-1'] : [],
    appliedRules: [],
    finalConfig,
    ignoredConflicts: [],
  };
}

function createMatchedUnit() {
  return {
    unitProductionId: 'unit-1',
    cropName: 'Melo',
    products: [],
    jobs: [],
  };
}

function createDosageUnit() {
  return {
    unitProductionId: 'unit-1',
    cropName: 'Melo',
    products: [],
    jobs: [],
  };
}
