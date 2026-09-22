const mockFlowMatchCropTreatment = jest.fn();
const mockAssertProductionUnitsAccess = jest.fn();

jest.mock('../../dosage_agent/flowMatchCropTreatment', () => ({
  flowMatchCropTreatment: (...args: unknown[]) => mockFlowMatchCropTreatment(...args),
}));

jest.mock('../tools/authorization', () => ({
  assertProductionUnitsAccess: (...args: unknown[]) => mockAssertProductionUnitsAccess(...args),
}));

jest.mock('../../dosage_agent/historyCollector', () => ({
  JobHistoryManager: jest.fn(() => ({})),
}));

import { createSearchProductsTool } from '../tools/search-products.tool';
import { clearWorkingMemory, getWorkingMemory } from '../working-memory';

const VALID_UNIT_ID = '11111111-1111-4111-8111-111111111111';

describe('search_products production unit reference validation', () => {
  const threadId = 'search-products-validation-thread';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    jest.clearAllMocks();
  });

  it('rejects a synthetic crop-name id before matching products or writing working memory', async () => {
    const tool = createSearchProductsTool(threadId, undefined, 'user-1');

    const raw = await tool.func({
      products: [],
      unitOfProduction: [{ id: 'vite', cropName: 'Vite', areaHa: 1 }],
    });
    const result = JSON.parse(raw as string);

    expect(result.code).toBe('INVALID_PRODUCTION_UNIT_REFERENCE');
    expect(result.blocked).toBe(true);
    expect(result.invalidUnitCount).toBe(1);
    expect(result.hint).toContain('list_production_units');
    expect(mockAssertProductionUnitsAccess).not.toHaveBeenCalled();
    expect(mockFlowMatchCropTreatment).not.toHaveBeenCalled();
    expect(getWorkingMemory(threadId).inputUnits).toBeUndefined();
    expect(getWorkingMemory(threadId).matchedProducts).toBeUndefined();
    expect(getWorkingMemory(threadId).matchedProductsFingerprint).toBeUndefined();
  });

  it('rejects a valid UUID that is not authorized and keeps working memory untouched', async () => {
    mockAssertProductionUnitsAccess.mockRejectedValueOnce(
      new Error('Una o più unità produttive non sono autorizzate per questo utente (1).'),
    );
    const tool = createSearchProductsTool(threadId, undefined, 'user-1');

    const raw = await tool.func({
      products: [],
      unitOfProduction: [{ id: VALID_UNIT_ID, cropName: 'Vite', areaHa: 1 }],
    });
    const result = JSON.parse(raw as string);

    expect(mockAssertProductionUnitsAccess).toHaveBeenCalledWith('user-1', [VALID_UNIT_ID]);
    expect(result.code).toBe('INVALID_PRODUCTION_UNIT_REFERENCE');
    expect(result.blocked).toBe(true);
    expect(result.invalidUnitCount).toBe(1);
    expect(result.reason).toMatch(/non.*autorizzate/i);
    expect(mockFlowMatchCropTreatment).not.toHaveBeenCalled();
    expect(getWorkingMemory(threadId).inputUnits).toBeUndefined();
    expect(getWorkingMemory(threadId).matchedProducts).toBeUndefined();
  });
});
