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
import { type InvoiceExtractionData, type DdtExtractionData, type StockExtractionData } from '../domain/dtos/file-extraction.dto';
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

  // ─── ExtractionConfirmer — Invoice ───

  describe('ExtractionConfirmer — invoice', () => {
    it('should confirm invoice extraction and create products + stocks', async () => {
      const inputExtraction = await createExtraction({ category: 'invoice' });
      const inputData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'Glifosate 360',
            registrationNumber: 'REG-001',
            productCategory: 'PHYTOSANITARY',
            administrativeStatus: null,
            quantity: 10,
            quantityUnitOfMeasure: 'L',
            unitPrice: 14.0,
            totalPrice: 150.0,
            needsReview: true,
            reviewReasons: ['Price mismatch: 10 * 14 != 150'],
            invoiceNumber: 'FT-2026-001',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'AgroSupplier SRL',
            supplierVat: '98765432109',
          },
          {
            productName: 'Concime NPK 20-10-10',
            registrationNumber: null,
            productCategory: 'FERTILIZER',
            administrativeStatus: null,
            quantity: 500,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 0.8,
            totalPrice: 400.0,
            invoiceNumber: 'FT-2026-001',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'AgroSupplier SRL',
            supplierVat: '98765432109',
          },
        ],
        extractedCount: 2,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id);
      expect(actualResult.status).toBe('CONFIRMED');
      expect(actualResult.category).toBe('invoice');
      expect((actualResult.summary as { productsCreated: number }).productsCreated).toBe(2);
      expect((actualResult.summary as { stocksCreated: number }).stocksCreated).toBe(2);
      const actualExtraction = await fileExtractionRepo.findById(inputExtraction.id);
      const actualData = actualExtraction?.extractedData as InvoiceExtractionData;
      expect(actualData.entries[0].unitPrice).toBe(15);
      expect(actualData.entries[0].needsReview).toBe(false);
      expect(actualData.entries[0].reviewReasons).toEqual([]);
    });

    it('should confirm DDT extraction (same pipeline as invoice)', async () => {
      const inputExtraction = await createExtraction({ category: 'ddt' });
      const inputData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'DDT Product Test',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 25,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 5.0,
            totalPrice: 125.0,
            invoiceNumber: 'DDT-2026-TEST',
            invoiceDate: '2026-03-10',
            invoiceDueDate: null,
            supplierName: 'DDT Supplier',
            supplierVat: '11122233344',
          },
        ],
        extractedCount: 1,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id);
      expect(actualResult.status).toBe('CONFIRMED');
      expect(actualResult.category).toBe('ddt');
      expect((actualResult.summary as { productsCreated: number }).productsCreated).toBe(1);
      expect((actualResult.summary as { stocksCreated: number }).stocksCreated).toBe(1);
    });

    it('should confirm DDT extraction with invoiceEntries body and persist ddt stock fields', async () => {
      const inputExtraction = await createExtraction({ category: 'ddt' });
      const inputData: DdtExtractionData = {
        entries: [
          {
            productName: 'Steel panel',
            registrationNumber: null,
            productCategory: 'OTHER',
            quantity: 25,
            quantityUnitOfMeasure: 'PZ',
            unitPrice: 18.5,
            totalPrice: 462.5,
            supplierName: 'EXAMPLE MANUFACTURING S.R.L.',
            supplierVat: '03471920367',
            ddtDate: '2026-05-28',
            orderNumber: '37/2026',
          },
        ],
        extractedCount: 1,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id, {
        invoiceEntries: inputData.entries.map((entry) => ({ ...entry, accepted: true })),
      });
      expect(actualResult.status).toBe('CONFIRMED');
      const actualStock = await prisma.stock.findFirst({
        where: { sourceExtractionId: inputExtraction.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(actualStock?.ddtCode).toBe('37/2026');
      expect(actualStock?.ddtDate?.toISOString().slice(0, 10)).toBe('2026-05-28');
    });
  });

  // ─── ExtractionConfirmer — Stock ───

  describe('ExtractionConfirmer — stock', () => {
    it('should confirm stock extraction with empty entries (stub)', async () => {
      const inputExtraction = await createExtraction({ category: 'stock' });
      const inputData: StockExtractionData = {
        entries: [],
        extractedCount: 0,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id);
      expect(actualResult.status).toBe('CONFIRMED');
      expect(actualResult.category).toBe('stock');
      expect((actualResult.summary as { productsCreated: number }).productsCreated).toBe(0);
    });
  });});
