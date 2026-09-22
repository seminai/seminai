import { AppError } from '../domain/errors/AppError';
import { ExtractDocumentApiUseCase } from '../application/use-cases/extraction-api/ExtractDocumentApiUseCase';
import type { IExtractionApiAccountRepository } from '../domain/repositories/IExtractionApiAccountRepository';
import type { IExtractionApiUsageLogRepository } from '../domain/repositories/IExtractionApiUsageLogRepository';
import type { InvoiceEntry } from '../domain/dtos/invoice-entry.dto';

describe('ExtractDocumentApiUseCase', () => {
  const account: IExtractionApiAccountRepository = {
    findByUserId: jest.fn().mockResolvedValue({
      id: 'acc-1',
      userId: 'user-1',
      pageQuota: 10,
      pagesUsed: 10,
    }),
    createForUser: jest.fn(),
    addPageQuota: jest.fn(),
    consumePages: jest.fn().mockResolvedValue({
      id: 'acc-1',
      userId: 'user-1',
      pageQuota: 10,
      pagesUsed: 9,
    }),
    toSummary: jest.fn().mockReturnValue({
      pageQuota: 10,
      pagesUsed: 9,
      pagesRemaining: 1,
    }),
  };

  const usageLog: IExtractionApiUsageLogRepository = {
    create: jest.fn().mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      apiKeyId: 'key-1',
      documentType: 'invoice',
      detectedType: 'invoice',
      fileName: 'invoice.pdf',
      pagesProcessed: 1,
      pagesCharged: 1,
      createdAt: new Date(),
    }),
    listByUser: jest.fn(),
  };

  it('rejects extraction when page quota is insufficient', async () => {
    const useCase = new ExtractDocumentApiUseCase(account, usageLog, {
      invoiceServiceFactory: () =>
        ({
          execute: jest.fn(),
        }) as never,
    });
    await expect(
      useCase.execute({
        userId: 'user-1',
        apiKeyId: 'key-1',
        fileBuffer: Buffer.from('image-bytes'),
        fileName: 'invoice.jpg',
        mimeType: 'image/jpeg',
        documentType: 'invoice',
      }),
    ).rejects.toMatchObject({
      statusCode: 402,
      code: 'INSUFFICIENT_PAGE_QUOTA',
    } satisfies Partial<AppError>);
  });

  it('consumes pages and returns entries when quota is available', async () => {
    (account.findByUserId as jest.Mock).mockResolvedValueOnce({
      id: 'acc-1',
      userId: 'user-1',
      pageQuota: 10,
      pagesUsed: 0,
    });
    const entry: InvoiceEntry = {
      productName: 'TEST PRODUCT',
      registrationNumber: null,
      productCategory: 'OTHER',
      administrativeStatus: null,
      quantity: 1,
      quantityUnitOfMeasure: 'NR',
      supplierName: null,
      supplierVat: null,
      invoiceNumber: '1',
      invoiceDate: '2025-01-01',
      invoiceDueDate: null,
      unitPrice: 10,
      totalPrice: 10,
    };
    const useCase = new ExtractDocumentApiUseCase(account, usageLog, {
      invoiceServiceFactory: () =>
        ({
          execute: jest.fn().mockResolvedValue({ entries: [entry], rawTextPath: '/tmp/x.pdf' }),
        }) as never,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      apiKeyId: 'key-1',
      fileBuffer: Buffer.from('not-a-real-pdf'),
      fileName: 'invoice.xml',
      mimeType: 'application/xml',
      documentType: 'invoice',
    });
    expect(result.entries).toHaveLength(1);
    expect(result.pagesCharged).toBe(0);
    expect(account.consumePages).toHaveBeenCalledWith('user-1', 0);
  });
});
