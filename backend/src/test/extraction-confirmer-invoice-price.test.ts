import { type CompanyKind } from '@prisma/client';
import { type BulkImportFieldsAndProductionUnitsUseCase } from '../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { type CreateOrUpdateProductsAndStocksBulkUseCase } from '../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { type InvoiceExtractionData } from '../domain/dtos/file-extraction.dto';
import { type ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import {
  type FileExtractionRecord,
  type IFileExtractionRepository,
} from '../domain/repositories/IFileExtractionRepository';
import { ExtractionConfirmer } from '../infrastructure/services/extraction/extraction-confirmer';

describe('ExtractionConfirmer invoice price reconciliation', () => {
  it('persists the corrected unit price before confirming the extraction', async () => {
    const inputExtraction = createExtraction();
    const update = jest.fn().mockResolvedValue(inputExtraction);
    const fileExtractionRepository = {
      findById: jest.fn().mockResolvedValue(inputExtraction),
      update,
    } as unknown as IFileExtractionRepository;
    const companyRepository = {
      findById: jest.fn().mockResolvedValue({ kind: 'AGRICULTURAL' as CompanyKind }),
    } as unknown as ICompanyRepository;
    const bulkImportUseCase = {} as BulkImportFieldsAndProductionUnitsUseCase;
    const productStockUseCase = {
      execute: jest.fn().mockResolvedValue({
        productsCreated: 1,
        productsUpdated: 0,
        stocksCreated: 1,
      }),
    } as unknown as CreateOrUpdateProductsAndStocksBulkUseCase;
    const confirmer = new ExtractionConfirmer(
      fileExtractionRepository,
      companyRepository,
      bulkImportUseCase,
      productStockUseCase,
    );
    await confirmer.confirm(inputExtraction.id);
    expect(update).toHaveBeenNthCalledWith(1, inputExtraction.id, {
      extractedData: {
        ...(inputExtraction.extractedData as InvoiceExtractionData),
        entries: [
          expect.objectContaining({
            unitPrice: 33,
            needsReview: false,
            reviewReasons: [],
          }),
        ],
      },
    });
    expect(update).toHaveBeenNthCalledWith(2, inputExtraction.id, { status: 'CONFIRMED' });
  });
});

function createExtraction(): FileExtractionRecord {
  return {
    id: 'extraction-1',
    batchId: 'batch-1',
    companyId: 'company-1',
    userId: 'user-1',
    status: 'PENDING_CONFIRMATION',
    category: 'invoice',
    progress: 100,
    extractedData: {
      entries: [
        {
          productName: 'SERCADIS SC LT.1',
          registrationNumber: '016945',
          productCategory: 'PHYTOSANITARY',
          administrativeStatus: 'Autorizzato',
          quantity: 9,
          quantityUnitOfMeasure: 'NR',
          supplierName: 'Supplier',
          supplierVat: '01234567890',
          invoiceNumber: 'FT 1',
          invoiceDate: '2025-03-31',
          invoiceDueDate: null,
          unitPrice: 32,
          totalPrice: 297,
          needsReview: true,
          reviewReasons: ['Price mismatch: 9 * 32 != 297'],
        },
      ],
      extractedCount: 1,
    },
    error: null,
    fileName: 'invoice.pdf',
    fileIndex: 0,
    fileId: null,
    fileUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
