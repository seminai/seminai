import { ExtractionConfirmer } from '../infrastructure/services/extraction/extraction-confirmer';
import type {
  IFileExtractionRepository,
  FileExtractionRecord,
} from '../domain/repositories/IFileExtractionRepository';
import type { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import type { BulkImportFieldsAndProductionUnitsUseCase } from '../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import type { CreateOrUpdateProductsAndStocksBulkUseCase } from '../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';

describe('ExtractionConfirmer field date propagation', () => {
  const companyId = 'company-1';

  function buildExtractionRecord(
    overrides: Partial<FileExtractionRecord> = {},
  ): FileExtractionRecord {
    return {
      id: 'extraction-1',
      batchId: 'batch-1',
      status: 'PENDING_CONFIRMATION',
      category: 'fields',
      progress: 100,
      extractedData: null,
      error: null,
      fileName: 'campi.csv',
      fileIndex: 0,
      fileId: null,
      fileUrl: null,
      companyId,
      userId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function buildConfirmer(bulkImportExecute: jest.Mock) {
    const findById = jest.fn();
    const fileExtractionRepository = {
      findById,
      update: jest.fn().mockImplementation(async (_id, data) => data),
    } as unknown as IFileExtractionRepository;

    const companyRepository = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: companyId, name: 'Azienda Test', vatNumber: 'IT123' }),
    } as unknown as ICompanyRepository;

    const bulkImportUseCase = {
      execute: bulkImportExecute,
    } as unknown as BulkImportFieldsAndProductionUnitsUseCase;

    const productStockUseCase = {
      execute: jest.fn(),
    } as unknown as CreateOrUpdateProductsAndStocksBulkUseCase;

    const confirmer = new ExtractionConfirmer(
      fileExtractionRepository,
      companyRepository,
      bulkImportUseCase,
      productStockUseCase,
    );

    return { confirmer, findById };
  }

  it('propagates inizioConduzione/fineConduzione from extracted field previews to the bulk import DTO', async () => {
    const bulkImportExecute = jest
      .fn()
      .mockResolvedValue({ fieldCount: 1, productionUnitCount: 0 });
    const { confirmer, findById } = buildConfirmer(bulkImportExecute);
    const extraction = buildExtractionRecord({
      extractedData: {
        fields: [
          {
            name: 'Campo 1',
            coordinates: [11.1, 45.2],
            superficieCatastaleMq: 10000,
            inizioConduzione: '2025-03-01',
            fineConduzione: '2025-09-30',
          },
        ],
      } as never,
    });
    findById.mockResolvedValue(extraction);

    await confirmer.confirm(extraction.id);

    expect(bulkImportExecute).toHaveBeenCalledTimes(1);
    const dto = bulkImportExecute.mock.calls[0][0];
    expect(dto.fields).toHaveLength(1);
    expect(dto.fields[0].inizioConduzione.toISOString().slice(0, 10)).toBe('2025-03-01');
    expect(dto.fields[0].fineConduzione.toISOString().slice(0, 10)).toBe('2025-09-30');
  });

  it('defaults missing conduction dates to the current year instead of dropping them', async () => {
    const bulkImportExecute = jest
      .fn()
      .mockResolvedValue({ fieldCount: 1, productionUnitCount: 0 });
    const { confirmer, findById } = buildConfirmer(bulkImportExecute);
    const extraction = buildExtractionRecord({
      extractedData: {
        fields: [
          {
            name: 'Campo 2',
            coordinates: [11.1, 45.2],
            superficieCatastaleMq: 10000,
            inizioConduzione: null,
            fineConduzione: null,
          },
        ],
      } as never,
    });
    findById.mockResolvedValue(extraction);

    await confirmer.confirm(extraction.id);

    const dto = bulkImportExecute.mock.calls[0][0];
    const currentYear = new Date().getFullYear();
    expect(dto.fields[0].inizioConduzione).toEqual(new Date(currentYear, 0, 1));
    expect(dto.fields[0].fineConduzione).toEqual(new Date(currentYear, 11, 31));
  });
});
