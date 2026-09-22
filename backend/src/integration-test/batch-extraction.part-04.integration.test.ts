import { v4 as uuid } from 'uuid';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteTestUser, deleteAllTestCompanies } from './helpers';
import { PrismaFileExtractionRepository } from '../infrastructure/repositories/PrismaFileExtractionRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { CreateOrUpdateProductsAndStocksBulkUseCase } from '../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { ExtractionConfirmer } from '../infrastructure/services/extraction/extraction-confirmer';
import { type InvoiceExtractionData } from '../domain/dtos/file-extraction.dto';
import type { FileExtractionRecord, CreateFileExtractionInput } from '../domain/repositories/IFileExtractionRepository';
describe('Batch Extraction Integration Tests', () => {
  let fileExtractionRepo: PrismaFileExtractionRepository;
  let companyRepository: PrismaCompanyRepository;
  let confirmer: ExtractionConfirmer;
  let testUserId: string;
  let testCompanyId: string;
  const createdExtractionIds: string[] = [];

  beforeAll(async () => {
    fileExtractionRepo = new PrismaFileExtractionRepository();
    const fieldRepository = new PrismaFieldRepository(prisma);
    companyRepository = new PrismaCompanyRepository(prisma);
    const productRepository = new PrismaProductRepository(prisma);
    const stockRepository = new PrismaStockRepository(prisma);
    const warehouseRepository = new PrismaWarehouseRepository(prisma);
    const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
    const bulkImportUseCase = new BulkImportFieldsAndProductionUnitsUseCase(
      fieldRepository,
      productionUnitRepository,
      companyRepository,
    );
    const productStockUseCase = new CreateOrUpdateProductsAndStocksBulkUseCase(
      productRepository,
      stockRepository,
      warehouseRepository,
    );
    confirmer = new ExtractionConfirmer(
      fileExtractionRepo,
      companyRepository,
      bulkImportUseCase,
      productStockUseCase,
    );
    const testUser = await createTestUser();
    testUserId = testUser.id;
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id;
  });

  afterAll(async () => {
    for (const id of createdExtractionIds) {
      await prisma.fileExtraction.delete({ where: { id } }).catch(() => {});
    }
    await deleteAllTestCompanies(testUserId);
    await deleteTestUser();
    await cleanupTestData();
  });

  function trackExtraction(record: FileExtractionRecord): FileExtractionRecord {
    createdExtractionIds.push(record.id);
    return record;
  }

  async function createExtraction(
    overrides: Partial<CreateFileExtractionInput> = {},
  ): Promise<FileExtractionRecord> {
    const input: CreateFileExtractionInput = {
      batchId: overrides.batchId ?? uuid(),
      category: overrides.category ?? 'fields',
      fileName: overrides.fileName ?? 'test-file.csv',
      fileIndex: overrides.fileIndex ?? 0,
      fileId: overrides.fileId ?? null,
      companyId: overrides.companyId ?? testCompanyId,
      userId: overrides.userId ?? testUserId,
    };
    const record = await fileExtractionRepo.create(input);
    return trackExtraction(record);
  }

  // ─── PATCH extractedData ───

  describe('PATCH extractedData', () => {
    it('should allow editing extractedData when PENDING_CONFIRMATION', async () => {
      const inputExtraction = await createExtraction({ category: 'invoice' });
      const inputOriginalData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'Original Product',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 10,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 5,
            totalPrice: 50,
            invoiceNumber: 'FT-EDIT',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'Supplier',
            supplierVat: '11111111111',
          },
          {
            productName: 'To Remove',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 1,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 1,
            totalPrice: 1,
            invoiceNumber: 'FT-EDIT',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'Supplier',
            supplierVat: '11111111111',
          },
        ],
        extractedCount: 2,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputOriginalData,
      });
      const inputEditedData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'Edited Product',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 20,
            quantityUnitOfMeasure: 'L',
            unitPrice: 10,
            totalPrice: 200,
            invoiceNumber: 'FT-EDIT-MODIFIED',
            invoiceDate: '2026-03-15',
            invoiceDueDate: null,
            supplierName: 'New Supplier',
            supplierVat: '22222222222',
          },
        ],
        extractedCount: 1,
      };
      const actualUpdated = await fileExtractionRepo.update(inputExtraction.id, {
        extractedData: inputEditedData,
      });
      const actualEntries = (actualUpdated.extractedData as InvoiceExtractionData).entries;
      expect(actualEntries).toHaveLength(1);
      expect(actualEntries[0].productName).toBe('Edited Product');
      expect(actualEntries[0].quantity).toBe(20);
      const actualConfirm = await confirmer.confirm(inputExtraction.id);
      expect(actualConfirm.status).toBe('CONFIRMED');
      expect((actualConfirm.summary as { productsCreated: number }).productsCreated).toBe(1);
    });
  });});
