import { saveStockOutTreatment } from '../saveStockOutTreatment';
import {
  assertCompanyAccess,
  assertFieldAccess,
  assertProductionUnitAccess,
} from '../../agents/shared/authorization';
import { calculateAggregatedStock } from '../../agents/dosage_agent/stockAggregator';

const mockCreateExecute = jest.fn();
const mockUpdateExecute = jest.fn();
const mockStockCreate = jest.fn();

jest.mock('../../agents/shared/authorization', () => ({
  assertCompanyAccess: jest.fn().mockResolvedValue(undefined),
  assertFieldAccess: jest.fn().mockResolvedValue(undefined),
  assertFieldsAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitsAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../agents/dosage_agent/stockAggregator', () => ({
  calculateAggregatedStock: jest.fn(),
}));

jest.mock('../../../../application/use-cases/field-note/CreateFieldNoteUseCase', () => ({
  CreateFieldNoteUseCase: jest.fn(() => ({ execute: mockCreateExecute })),
}));

jest.mock('../../../../application/use-cases/field-note/UpdateFieldNoteUseCase', () => ({
  UpdateFieldNoteUseCase: jest.fn(() => ({ execute: mockUpdateExecute })),
}));

jest.mock('../../../repositories/PrismaFieldNoteRepository', () => ({
  PrismaFieldNoteRepository: jest.fn(),
}));

jest.mock('../../../repositories/PrismaStockRepository', () => ({
  PrismaStockRepository: jest.fn(() => ({ create: mockStockCreate })),
}));

const mockedAssertCompanyAccess = assertCompanyAccess as jest.MockedFunction<
  typeof assertCompanyAccess
>;
const mockedAssertFieldAccess = assertFieldAccess as jest.MockedFunction<typeof assertFieldAccess>;
const mockedAssertProductionUnitAccess = assertProductionUnitAccess as jest.MockedFunction<
  typeof assertProductionUnitAccess
>;
const mockedCalculateAggregatedStock = calculateAggregatedStock as jest.MockedFunction<
  typeof calculateAggregatedStock
>;

function buildPrismaStub(
  overrides: {
    productCompanyId?: string;
    fieldCompanyId?: string | null;
    productionUnitOnFieldFound?: boolean;
  } = {},
) {
  const productCompanyId = overrides.productCompanyId ?? 'company-1';
  const fieldCompanyId =
    overrides.fieldCompanyId === undefined ? 'company-1' : overrides.fieldCompanyId;
  return {
    product: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'product-1',
        name: 'Rame',
        warehouse: { companyId: productCompanyId },
      }),
    },
    field: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'field-1',
        name: 'VITE',
        companyId: fieldCompanyId,
      }),
    },
    productionUnitOnField: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.productionUnitOnFieldFound === false ? null : { productionUnitId: 'pu-1' },
        ),
    },
  } as unknown as Parameters<typeof saveStockOutTreatment>[1];
}

function buildInput(overrides: Partial<Parameters<typeof saveStockOutTreatment>[2]> = {}) {
  return {
    productId: 'product-1',
    fieldId: 'field-1',
    productionUnitId: 'pu-1',
    quantity: 10,
    unitOfMeasureQuantity: 'kg',
    rawContent: 'ho dato 10 kg di rame nel campo vite',
    ...overrides,
  };
}

describe('saveStockOutTreatment', () => {
  beforeEach(() => {
    mockedAssertCompanyAccess.mockClear().mockResolvedValue(undefined);
    mockedAssertFieldAccess.mockClear().mockResolvedValue(undefined);
    mockedAssertProductionUnitAccess.mockClear().mockResolvedValue(undefined);
    mockedCalculateAggregatedStock.mockClear().mockResolvedValue({
      stockInTotal: 25,
      stockOutVerifiedTotal: -5,
      availableStock: 20,
    });
    mockCreateExecute.mockClear().mockResolvedValue({ id: 'field-note-1' });
    mockUpdateExecute.mockClear().mockResolvedValue(undefined);
    mockStockCreate.mockClear().mockResolvedValue({ id: 'stock-1' });
  });

  it('creates a negative Stock OUT and a processed field note', async () => {
    const result = await saveStockOutTreatment('user-1', buildPrismaStub(), buildInput());

    expect(result.success).toBe(true);
    expect(result.fieldNoteId).toBe('field-note-1');
    expect(result.stockId).toBe('stock-1');
    expect(result.insufficientStock).toBe(false);

    const stockArg = mockStockCreate.mock.calls[0][0];
    expect(stockArg.quantity).toBe(-10);
    expect(stockArg.type).toBe('OUT');
    expect(stockArg.productId).toBe('product-1');

    expect(mockedAssertCompanyAccess).toHaveBeenCalledWith('user-1', 'company-1');
    expect(mockedAssertFieldAccess).toHaveBeenCalledWith('user-1', 'field-1');
    expect(mockedAssertProductionUnitAccess).toHaveBeenCalledWith('user-1', 'pu-1');

    expect(mockUpdateExecute).toHaveBeenCalledWith(
      'field-note-1',
      'user-1',
      expect.objectContaining({
        status: 'PROCESSED',
        fieldId: 'field-1',
        productionUnitId: 'pu-1',
        productId: 'product-1',
        extractedData: expect.objectContaining({
          stockOperation: 'TREATMENT_OUT',
          stockId: 'stock-1',
          quantity: 10,
          unit: 'kg',
          availableStockBefore: 20,
          availableStockAfter: 10,
          insufficientStock: false,
        }),
      }),
    );
  });

  it('saves with a warning when stock is insufficient', async () => {
    mockedCalculateAggregatedStock.mockResolvedValueOnce({
      stockInTotal: 5,
      stockOutVerifiedTotal: 0,
      availableStock: 5,
    });

    const result = await saveStockOutTreatment('user-1', buildPrismaStub(), buildInput());

    expect(result.insufficientStock).toBe(true);
    expect(result.availableStockBefore).toBe(5);
    expect(result.availableStockAfter).toBe(-5);
    expect(result.message).toMatch(/disponibilita insufficiente/i);
    expect(mockStockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdateExecute).toHaveBeenCalledTimes(1);
  });

  it('rejects when product and field belong to different companies before writes', async () => {
    await expect(
      saveStockOutTreatment(
        'user-1',
        buildPrismaStub({ productCompanyId: 'company-1', fieldCompanyId: 'company-2' }),
        buildInput(),
      ),
    ).rejects.toThrow(/azienda diversa/);

    expect(mockedAssertCompanyAccess).not.toHaveBeenCalled();
    expect(mockStockCreate).not.toHaveBeenCalled();
    expect(mockCreateExecute).not.toHaveBeenCalled();
  });
});
