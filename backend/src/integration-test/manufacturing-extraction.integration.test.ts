import { v4 as uuid } from 'uuid';
import { CompanyKind, ProductCategory } from '@prisma/client';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteAllTestCompanies,
} from './helpers';
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
import type { DdtExtractionData, InvoiceExtractionData } from '../domain/dtos/file-extraction.dto';
import type {
  FileExtractionRecord,
  CreateFileExtractionInput,
} from '../domain/repositories/IFileExtractionRepository';

describe('Manufacturing extraction confirmation', () => {
  let fileExtractionRepo: PrismaFileExtractionRepository;
  let confirmer: ExtractionConfirmer;
  let testUserId: string;
  let manufacturingCompanyId: string;
  const createdExtractionIds: string[] = [];

  beforeAll(async () => {
    fileExtractionRepo = new PrismaFileExtractionRepository();
    const fieldRepository = new PrismaFieldRepository(prisma);
    const companyRepository = new PrismaCompanyRepository(prisma);
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
    const company = await createTestCompany({
      userId: testUserId,
      name: 'Example Manufacturing Test SRL',
      kind: CompanyKind.MANUFACTURING,
    });
    manufacturingCompanyId = company.id;
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
      category: overrides.category ?? 'invoice',
      fileName: overrides.fileName ?? 'test-file.pdf',
      fileIndex: overrides.fileIndex ?? 0,
      fileId: overrides.fileId ?? null,
      companyId: overrides.companyId ?? manufacturingCompanyId,
      userId: overrides.userId ?? testUserId,
    };
    const record = await fileExtractionRepo.create(input);
    return trackExtraction(record);
  }

  it('confirms invoice with EQUIPMENT enum → Product.category EQUIPMENT, type Generico', async () => {
    const inputExtraction = await createExtraction({ category: 'invoice' });
    const inputData: InvoiceExtractionData = {
      entries: [
        {
          productName: 'Pressa idraulica mod. PH-200',
          registrationNumber: null,
          productCategory: 'EQUIPMENT',
          administrativeStatus: null,
          quantity: 1,
          quantityUnitOfMeasure: 'PZ',
          unitPrice: 12500,
          totalPrice: 12500,
          invoiceNumber: '37/2026',
          invoiceDate: '2026-05-28',
          invoiceDueDate: null,
          supplierName: 'EXAMPLE MANUFACTURING S.R.L.',
          supplierVat: '03471920367',
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

    const actualStock = await prisma.stock.findFirst({
      where: { sourceExtractionId: inputExtraction.id },
      include: { product: true },
    });
    expect(actualStock?.product.category).toBe(ProductCategory.EQUIPMENT);
    expect(actualStock?.product.type).toBe('Generico');
  });

  it('confirms invoice with custom category Lamiera → Product.category OTHER, type Lamiera', async () => {
    const inputExtraction = await createExtraction({ category: 'invoice' });
    const inputData: InvoiceExtractionData = {
      entries: [
        {
          productName: 'Lamiera acciaio S235JR tagliata laser sp. 2,0 mm',
          registrationNumber: null,
          productCategory: 'Lamiera',
          administrativeStatus: null,
          quantity: 25,
          quantityUnitOfMeasure: 'PZ',
          unitPrice: 18.5,
          totalPrice: 462.5,
          invoiceNumber: '37/2026',
          invoiceDate: '2026-05-28',
          invoiceDueDate: null,
          supplierName: 'EXAMPLE MANUFACTURING S.R.L.',
          supplierVat: '03471920367',
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

    const actualStock = await prisma.stock.findFirst({
      where: { sourceExtractionId: inputExtraction.id },
      include: { product: true },
    });
    expect(actualStock?.product.category).toBe(ProductCategory.OTHER);
    expect(actualStock?.product.type).toBe('Lamiera');
  });

  it('confirms DDT synthetic manufacturing payload and persists stock ddt fields', async () => {
    const inputExtraction = await createExtraction({ category: 'ddt' });
    const inputData: DdtExtractionData = {
      entries: [
        {
          productName: 'Carter di protezione inox AISI 304 piegato - mod. CRT-120',
          registrationNumber: null,
          productCategory: 'PACKAGING',
          quantity: 15,
          quantityUnitOfMeasure: 'PZ',
          unitPrice: 34,
          totalPrice: 510,
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
    expect(actualResult.category).toBe('ddt');

    const actualStock = await prisma.stock.findFirst({
      where: { sourceExtractionId: inputExtraction.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(actualStock?.product.category).toBe(ProductCategory.PACKAGING);
    expect(actualStock?.product.type).toBe('Generico');
    expect(actualStock?.ddtCode).toBe('37/2026');
    expect(actualStock?.ddtDate?.toISOString().slice(0, 10)).toBe('2026-05-28');
  });
});
