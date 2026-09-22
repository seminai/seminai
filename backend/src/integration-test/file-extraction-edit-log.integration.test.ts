import { v4 as uuid } from 'uuid';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteAllTestCompanies,
} from './helpers';
import { PrismaFileExtractionRepository } from '../infrastructure/repositories/PrismaFileExtractionRepository';
import { PrismaFileExtractionEditLogRepository } from '../infrastructure/repositories/PrismaFileExtractionEditLogRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { LogFileExtractionEditUseCase } from '../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { ExportInvoiceExtractionDatasetUseCase } from '../application/use-cases/extraction/ExportInvoiceExtractionDatasetUseCase';
import { ExtractionConfirmer } from '../infrastructure/services/extraction/extraction-confirmer';
import { FileExtractionController } from '../infrastructure/http/controllers/FileExtractionController';
import { parse as parseYaml } from 'yaml';
import { type BulkImportFieldsAndProductionUnitsUseCase } from '../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { type CreateOrUpdateProductsAndStocksBulkUseCase } from '../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { type ListFileExtractionsUseCase } from '../application/use-cases/extraction/ListFileExtractionsUseCase';
import { type ListExtractionCategorySummaryUseCase } from '../application/use-cases/extraction/ListExtractionCategorySummaryUseCase';
import { type BatchExtractionOrchestrator } from '../infrastructure/services/extraction/batch-extraction-orchestrator';
import type { Request, Response } from 'express';
import type { FileExtractionRecord } from '../domain/repositories/IFileExtractionRepository';

/**
 * Build a fully valid invoice entry. The edit endpoint validates the schema and
 * the confirm endpoint additionally requires positive quantity, a unit, and a
 * total price (both guards added in 2f831c3), so entries must carry real values.
 */
function invoiceEntry(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productName: name,
    registrationNumber: null,
    productCategory: 'OTHER',
    administrativeStatus: null,
    quantity: 1,
    quantityUnitOfMeasure: 'kg',
    supplierName: null,
    supplierVat: null,
    invoiceNumber: null,
    invoiceDate: null,
    invoiceDueDate: null,
    unitPrice: null,
    totalPrice: 1,
    ...extra,
  };
}

/** Build a fully valid DDT entry (DDT schema omits invoice-only fields). */
function ddtEntry(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productName: name,
    registrationNumber: null,
    productCategory: 'OTHER',
    quantity: 1,
    quantityUnitOfMeasure: 'kg',
    supplierName: null,
    supplierVat: null,
    ddtDate: null,
    orderNumber: null,
    totalPrice: 1,
    ...extra,
  };
}

interface MockResponseLike {
  json: jest.Mock;
  status: jest.Mock;
}

function mockResponse(): MockResponseLike & Pick<Response, 'json' | 'status'> {
  const res: Partial<Response> & { json: jest.Mock; status: jest.Mock } = {
    json: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as MockResponseLike & Pick<Response, 'json' | 'status'>;
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: 'placeholder' },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

describe('FileExtraction edit log integration', () => {
  let extractionRepo: PrismaFileExtractionRepository;
  let editLogRepo: PrismaFileExtractionEditLogRepository;
  let companyRepo: PrismaCompanyRepository;
  let logEditUseCase: LogFileExtractionEditUseCase;
  let confirmer: ExtractionConfirmer;
  let controller: FileExtractionController;
  let testUserId: string;
  let testCompanyId: string;
  const trackedExtractionIds: string[] = [];
  const trackedFileIds: string[] = [];

  const productStockExecuteMock = jest
    .fn<Promise<{ productsCreated: number; productsUpdated: number; stocksCreated: number }>, []>()
    .mockResolvedValue({ productsCreated: 0, productsUpdated: 0, stocksCreated: 0 });

  beforeAll(async () => {
    extractionRepo = new PrismaFileExtractionRepository();
    editLogRepo = new PrismaFileExtractionEditLogRepository();
    companyRepo = new PrismaCompanyRepository(prisma);
    logEditUseCase = new LogFileExtractionEditUseCase(editLogRepo);

    const productStockStub = {
      execute: productStockExecuteMock,
    } as unknown as CreateOrUpdateProductsAndStocksBulkUseCase;
    const bulkImportStub = {
      execute: jest.fn().mockResolvedValue({ fieldCount: 0, productionUnitCount: 0 }),
    } as unknown as BulkImportFieldsAndProductionUnitsUseCase;

    confirmer = new ExtractionConfirmer(
      extractionRepo,
      companyRepo,
      bulkImportStub,
      productStockStub,
      logEditUseCase,
    );

    controller = new FileExtractionController(
      {} as BatchExtractionOrchestrator,
      confirmer,
      extractionRepo,
      companyRepo,
      {} as ListFileExtractionsUseCase,
      {} as ListExtractionCategorySummaryUseCase,
      logEditUseCase,
      editLogRepo,
    );

    const testUser = await createTestUser();
    testUserId = testUser.id;
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id;
  });

  afterAll(async () => {
    for (const id of trackedExtractionIds) {
      await prisma.fileExtractionEditLog
        .deleteMany({ where: { extractionId: id } })
        .catch(() => {});
      await prisma.fileExtraction.delete({ where: { id } }).catch(() => {});
    }
    for (const id of trackedFileIds) {
      await prisma.file.delete({ where: { id } }).catch(() => {});
    }
    await deleteAllTestCompanies(testUserId);
    await deleteTestUser();
    await cleanupTestData();
  });

  async function createInvoiceExtraction(
    initialEntries: ReadonlyArray<Record<string, unknown>>,
    options: { withFile?: boolean; category?: 'invoice' | 'ddt' | 'fields' } = {},
  ): Promise<FileExtractionRecord> {
    const category = options.category ?? 'invoice';
    let fileId: string | null = null;
    if (options.withFile !== false) {
      const file = await prisma.file.create({
        data: {
          name: `test-${category}-${uuid()}.pdf`,
          url: `https://test.invalid/${uuid()}.pdf`,
          companyId: testCompanyId,
          type: 'extractions',
          metadata: { uploadedBy: testUserId },
        },
      });
      fileId = file.id;
      trackedFileIds.push(fileId);
    }
    const created = await extractionRepo.create({
      batchId: uuid(),
      category: category as 'invoice' | 'ddt' | 'fields',
      fileName: `test-${category}.pdf`,
      fileIndex: 0,
      fileId,
      companyId: testCompanyId,
      userId: testUserId,
    });
    trackedExtractionIds.push(created.id);
    await extractionRepo.update(created.id, {
      status: 'PENDING_CONFIRMATION',
      progress: 100,
      extractedData: {
        entries: initialEntries,
        extractedCount: initialEntries.length,
      } as never,
    });
    if (category === 'invoice' || category === 'ddt') {
      await logEditUseCase.execute({
        extractionId: created.id,
        source: 'LLM_INITIAL',
        before: null,
        after: { entries: initialEntries, extractedCount: initialEntries.length },
        userId: null,
      });
    }
    const reloaded = await extractionRepo.findById(created.id);
    if (!reloaded) throw new Error('extraction not found after seed');
    return reloaded;
  }

  it('full happy path invoice: LLM_INITIAL → USER_EDIT × 2 → CONFIRM_OVERRIDE', async () => {
    const initial = [{ name: 'urea-llm', accepted: true }];
    const extraction = await createInvoiceExtraction(initial);

    await controller.update(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: extraction.id } as Request['params'],
        body: {
          extractedData: {
            entries: [invoiceEntry('urea-edit-1', { accepted: true })],
            extractedCount: 1,
          },
        },
      }),
      mockResponse() as unknown as Response,
    );
    await controller.update(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: extraction.id } as Request['params'],
        body: {
          extractedData: {
            entries: [invoiceEntry('urea-edit-2', { accepted: true })],
            extractedCount: 1,
          },
        },
      }),
      mockResponse() as unknown as Response,
    );
    const finalEntries = [invoiceEntry('urea-final', { accepted: true })];
    await confirmer.confirm(extraction.id, {
      invoiceEntries: finalEntries as never,
      actorUserId: testUserId,
    });

    const logs = await prisma.fileExtractionEditLog.findMany({
      where: { extractionId: extraction.id },
      orderBy: { version: 'asc' },
    });
    expect(logs.map((l) => l.source)).toEqual([
      'LLM_INITIAL',
      'USER_EDIT',
      'USER_EDIT',
      'CONFIRM_OVERRIDE',
    ]);
    expect(logs.map((l) => l.version)).toEqual([0, 1, 2, 3]);
    expect((logs[0].afterData as { entries: unknown[] }).entries).toEqual(initial);
    expect((logs[3].afterData as { entries: unknown[] }).entries).toEqual(finalEntries);
    expect(logs[3].userId).toBe(testUserId);
  });

  it('full happy path ddt produces same trajectory', async () => {
    const extraction = await createInvoiceExtraction([{ name: 'ddt-llm' }], { category: 'ddt' });
    await controller.update(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: extraction.id } as Request['params'],
        body: { extractedData: { entries: [ddtEntry('ddt-edit')], extractedCount: 1 } },
      }),
      mockResponse() as unknown as Response,
    );
    await confirmer.confirm(extraction.id, {
      invoiceEntries: [invoiceEntry('ddt-final', { accepted: true })] as never,
      actorUserId: testUserId,
    });
    const logs = await prisma.fileExtractionEditLog.findMany({
      where: { extractionId: extraction.id },
      orderBy: { version: 'asc' },
    });
    expect(logs.map((l) => l.source)).toEqual(['LLM_INITIAL', 'USER_EDIT', 'CONFIRM_OVERRIDE']);
  });

  it('no-op PATCH does not produce extra log row', async () => {
    const sameEntries = [invoiceEntry('unchanged', { accepted: true })];
    const extraction = await createInvoiceExtraction(sameEntries);

    await controller.update(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: extraction.id } as Request['params'],
        body: {
          extractedData: { entries: sameEntries, extractedCount: sameEntries.length },
        },
      }),
      mockResponse() as unknown as Response,
    );

    const logs = await prisma.fileExtractionEditLog.findMany({
      where: { extractionId: extraction.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].source).toBe('LLM_INITIAL');
  });

  it('category outside scope (fields) writes no log', async () => {
    const extraction = await createInvoiceExtraction([{ name: 'irrelevant' }], {
      category: 'fields',
    });
    await controller.update(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: extraction.id } as Request['params'],
        body: { extractedData: { fields: [{ name: 'changed' }] } },
      }),
      mockResponse() as unknown as Response,
    );
    const logs = await prisma.fileExtractionEditLog.findMany({
      where: { extractionId: extraction.id },
    });
    expect(logs).toHaveLength(0);
  });

  it('confirm without invoiceEntries override emits no CONFIRM_OVERRIDE log', async () => {
    const extraction = await createInvoiceExtraction([invoiceEntry('as-llm', { accepted: true })]);
    await confirmer.confirm(extraction.id, { actorUserId: testUserId });
    const logs = await prisma.fileExtractionEditLog.findMany({
      where: { extractionId: extraction.id },
      orderBy: { version: 'asc' },
    });
    expect(logs.map((l) => l.source)).toEqual(['LLM_INITIAL']);
  });

  it('backfill: legacy extraction without LLM_INITIAL gets a synthetic one on first PATCH', async () => {
    const file = await prisma.file.create({
      data: {
        name: `legacy-${uuid()}.pdf`,
        url: `https://test.invalid/${uuid()}.pdf`,
        companyId: testCompanyId,
        type: 'extractions',
        metadata: { uploadedBy: testUserId },
      },
    });
    trackedFileIds.push(file.id);
    const initial = [{ name: 'legacy-llm-snapshot' }];
    const created = await extractionRepo.create({
      batchId: uuid(),
      category: 'invoice',
      fileName: 'legacy.pdf',
      fileIndex: 0,
      fileId: file.id,
      companyId: testCompanyId,
      userId: testUserId,
    });
    trackedExtractionIds.push(created.id);
    await extractionRepo.update(created.id, {
      status: 'PENDING_CONFIRMATION',
      progress: 100,
      extractedData: { entries: initial, extractedCount: initial.length } as never,
    });
    const before = await prisma.fileExtractionEditLog.count({
      where: { extractionId: created.id },
    });
    expect(before).toBe(0);

    await controller.update(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: created.id } as Request['params'],
        body: { extractedData: { entries: [invoiceEntry('first-user-edit')], extractedCount: 1 } },
      }),
      mockResponse() as unknown as Response,
    );

    const logs = await prisma.fileExtractionEditLog.findMany({
      where: { extractionId: created.id },
      orderBy: { version: 'asc' },
    });
    expect(logs.map((l) => l.source)).toEqual(['LLM_INITIAL', 'USER_EDIT']);
    expect((logs[0].afterData as { entries: unknown[] }).entries).toEqual(initial);
  });

  describe('Export dataset', () => {
    it('produces a YAML entry with source_document_url after a confirmed edit flow', async () => {
      const initial = [{ name: 'export-llm', accepted: true }];
      const extraction = await createInvoiceExtraction(initial);
      await controller.update(
        mockRequest({
          user: { id: testUserId } as Request['user'],
          params: { id: extraction.id } as Request['params'],
          body: {
            extractedData: {
              entries: [invoiceEntry('export-edit-1', { accepted: true })],
              extractedCount: 1,
            },
          },
        }),
        mockResponse() as unknown as Response,
      );
      const finalEntries = [invoiceEntry('export-final', { accepted: true })];
      await confirmer.confirm(extraction.id, {
        invoiceEntries: finalEntries as never,
        actorUserId: testUserId,
      });
      const useCase = new ExportInvoiceExtractionDatasetUseCase(editLogRepo);

      const result = await useCase.execute({ companyId: testCompanyId });

      expect(result.entryCount).toBeGreaterThanOrEqual(1);
      const parsed = parseYaml(result.yaml) as Array<{
        vars: Record<string, unknown>;
        assert: Array<{ type: string }>;
      }>;
      const target = parsed.find((e) => e.vars.extraction_id === extraction.id);
      expect(target).toBeDefined();
      expect(typeof target!.vars.source_document_url).toBe('string');
      expect(target!.vars.source_document_url).toMatch(/^https:\/\//);
      expect(target!.vars.category).toBe('invoice');
      expect(target!.vars.company_id).toBe(testCompanyId);
      const initialOut = JSON.parse(target!.vars.llm_initial_output as string) as {
        entries: unknown[];
      };
      const finalOut = JSON.parse(target!.vars.final_confirmed_output as string) as {
        entries: unknown[];
      };
      expect(initialOut.entries).toEqual(initial);
      expect(finalOut.entries).toEqual(finalEntries);
      expect(target!.assert.map((a) => a.type)).toEqual(['javascript', 'llm-rubric']);
    });

    it('skips extractions whose underlying File was never linked', async () => {
      const noFileExtraction = await createInvoiceExtraction([{ name: 'no-file-llm' }], {
        withFile: false,
      });
      await controller.update(
        mockRequest({
          user: { id: testUserId } as Request['user'],
          params: { id: noFileExtraction.id } as Request['params'],
          body: { extractedData: { entries: [invoiceEntry('no-file-edit')], extractedCount: 1 } },
        }),
        mockResponse() as unknown as Response,
      );
      await confirmer.confirm(noFileExtraction.id, { actorUserId: testUserId });
      const useCase = new ExportInvoiceExtractionDatasetUseCase(editLogRepo);

      const result = await useCase.execute({ companyId: testCompanyId });
      const parsed = (parseYaml(result.yaml) as Array<{ vars: Record<string, unknown> }>) ?? [];
      expect(parsed.find((e) => e.vars.extraction_id === noFileExtraction.id)).toBeUndefined();
    });

    it('skips extractions still in PENDING_CONFIRMATION', async () => {
      const pending = await createInvoiceExtraction([{ name: 'pending-llm' }]);
      await controller.update(
        mockRequest({
          user: { id: testUserId } as Request['user'],
          params: { id: pending.id } as Request['params'],
          body: { extractedData: { entries: [invoiceEntry('pending-edit')], extractedCount: 1 } },
        }),
        mockResponse() as unknown as Response,
      );
      const useCase = new ExportInvoiceExtractionDatasetUseCase(editLogRepo);

      const result = await useCase.execute({ companyId: testCompanyId });
      const parsed = (parseYaml(result.yaml) as Array<{ vars: Record<string, unknown> }>) ?? [];
      expect(parsed.find((e) => e.vars.extraction_id === pending.id)).toBeUndefined();
    });
  });

  it('getEditHistory returns the chronologically ordered log', async () => {
    const extraction = await createInvoiceExtraction([{ name: 'history-test' }]);
    await controller.update(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: extraction.id } as Request['params'],
        body: { extractedData: { entries: [invoiceEntry('history-edit')], extractedCount: 1 } },
      }),
      mockResponse() as unknown as Response,
    );
    const res = mockResponse();
    await controller.getEditHistory(
      mockRequest({
        user: { id: testUserId } as Request['user'],
        params: { id: extraction.id } as Request['params'],
      }),
      res as unknown as Response,
    );
    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = (res.json as jest.Mock).mock.calls[0][0] as {
      data: { logs: Array<{ source: string; version: number }> };
    };
    expect(payload.data.logs.map((l) => l.source)).toEqual(['LLM_INITIAL', 'USER_EDIT']);
    expect(payload.data.logs.map((l) => l.version)).toEqual([0, 1]);
  });
});
