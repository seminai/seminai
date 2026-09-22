/**
 * Unit tests for the authorization gate added to saveFieldNote (PR-A of P2).
 * Focus: the smart-resolve no longer silently overrides input.fieldId, and
 * assertFieldAccess / assertProductionUnitAccess are invoked before any DB
 * write happens.
 */
import { saveFieldNote } from '../saveFieldNote';
import { assertFieldAccess, assertProductionUnitAccess } from '../../agents/shared/authorization';

const mockCreateExecute = jest.fn();
const mockUpdateExecute = jest.fn();

jest.mock('../../agents/shared/authorization', () => ({
  assertCompanyAccess: jest.fn().mockResolvedValue(undefined),
  assertFieldAccess: jest.fn().mockResolvedValue(undefined),
  assertFieldsAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitsAccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../application/use-cases/field-note/CreateFieldNoteUseCase', () => ({
  CreateFieldNoteUseCase: jest.fn(() => ({ execute: mockCreateExecute })),
}));

jest.mock('../../../../application/use-cases/field-note/UpdateFieldNoteUseCase', () => ({
  UpdateFieldNoteUseCase: jest.fn(() => ({ execute: mockUpdateExecute })),
}));

jest.mock('../../conformity-notes.service', () => ({
  ConformityNotesService: jest.fn(() => ({
    buildConformityNotes: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('../../../repositories/PrismaFieldNoteRepository', () => ({
  PrismaFieldNoteRepository: jest.fn(() => ({
    addAttachment: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockedAssertFieldAccess = assertFieldAccess as jest.MockedFunction<typeof assertFieldAccess>;
const mockedAssertProductionUnitAccess = assertProductionUnitAccess as jest.MockedFunction<
  typeof assertProductionUnitAccess
>;

function buildPrismaStub() {
  return {
    productionUnitOnField: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  } as unknown as Parameters<typeof saveFieldNote>[1];
}

function buildInput(overrides: Partial<Parameters<typeof saveFieldNote>[2]> = {}) {
  return {
    rawContent: 'ho dato 5kg di rame',
    category: 'OPERATION' as const,
    extractedData: {},
    ...overrides,
  };
}

describe('saveFieldNote — authorization gate (PR-A)', () => {
  beforeEach(() => {
    mockedAssertFieldAccess.mockClear().mockResolvedValue(undefined);
    mockedAssertProductionUnitAccess.mockClear().mockResolvedValue(undefined);
    mockCreateExecute.mockClear().mockResolvedValue({ id: 'created-note-id' });
    mockUpdateExecute.mockClear().mockResolvedValue(undefined);
  });

  it('throws when input.fieldId differs from extractedData.recognizedFields[0].fieldId (no silent override)', async () => {
    const prisma = buildPrismaStub();
    const input = buildInput({
      fieldId: 'field-from-input',
      extractedData: {
        recognizedFields: [{ name: 'Vigneto', fieldId: 'field-from-extracted' }],
      },
    });

    await expect(saveFieldNote('user-1', prisma, input)).rejects.toThrow(/Conflitto fieldId/);
    expect(mockedAssertFieldAccess).not.toHaveBeenCalled();
    expect(mockCreateExecute).not.toHaveBeenCalled();
  });

  it('accepts matching fieldId on input and extractedData (no false conflict)', async () => {
    const prisma = buildPrismaStub();
    const input = buildInput({
      fieldId: 'field-1',
      extractedData: {
        recognizedFields: [{ name: 'Vigneto', fieldId: 'field-1' }],
      },
    });

    await saveFieldNote('user-1', prisma, input);
    expect(mockedAssertFieldAccess).toHaveBeenCalledWith('user-1', 'field-1');
  });

  it('calls assertFieldAccess with the resolved fieldId before opening any DB write', async () => {
    const prisma = buildPrismaStub();
    const input = buildInput({ fieldId: 'field-1' });

    await saveFieldNote('user-1', prisma, input);

    expect(mockedAssertFieldAccess).toHaveBeenCalledTimes(1);
    expect(mockedAssertFieldAccess).toHaveBeenCalledWith('user-1', 'field-1');
    // assertFieldAccess must be invoked before the create use case executes
    const assertOrder = mockedAssertFieldAccess.mock.invocationCallOrder[0];
    const createOrder = mockCreateExecute.mock.invocationCallOrder[0];
    expect(assertOrder).toBeLessThan(createOrder);
  });

  it('calls assertProductionUnitAccess when productionUnitId is provided', async () => {
    const prisma = buildPrismaStub();
    const input = buildInput({ productionUnitId: 'pu-1' });

    await saveFieldNote('user-1', prisma, input);

    expect(mockedAssertProductionUnitAccess).toHaveBeenCalledWith('user-1', 'pu-1');
  });

  it('propagates assertFieldAccess throw and never invokes CreateFieldNoteUseCase.execute', async () => {
    mockedAssertFieldAccess.mockRejectedValueOnce(
      new Error('Campo non trovato o non autorizzato per questo utente.'),
    );
    const prisma = buildPrismaStub();
    const input = buildInput({ fieldId: 'foreign-field' });

    await expect(saveFieldNote('user-1', prisma, input)).rejects.toThrow(
      /Failed to save field note: Campo non trovato o non autorizzato/,
    );
    expect(mockCreateExecute).not.toHaveBeenCalled();
  });

  it('does not call assertFieldAccess when no fieldId is provided (warning path)', async () => {
    const prisma = buildPrismaStub();
    const input = buildInput({});

    await saveFieldNote('user-1', prisma, input);

    expect(mockedAssertFieldAccess).not.toHaveBeenCalled();
  });
});
