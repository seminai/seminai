import { CompanyKind } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type InvoiceExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { type ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import { mapInvoiceEntriesToProducts } from './map-invoice-entries-to-products';
import { assertConfirmableInvoiceEntries } from './confirm-invoice-entries-validator';
import { reconcileInvoiceEntryPrice } from './reconcile-invoice-entry-price';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerConfirmInvoice(this: ExtractionConfirmerContext, extraction: FileExtractionRecord, data: InvoiceExtractionData, requestData?: ConfirmExtractionRequestDTO): Promise<Record<string, unknown>> {
    const requestedEntries = requestData?.invoiceEntries ?? data.entries;
    const reconciledEntries = requestedEntries.map(reconcileInvoiceEntryPrice);
    const acceptedEntries = reconciledEntries.filter((entry) => entry.accepted !== false);
    if (acceptedEntries.length === 0) {
      throw AppError.badRequest(
        'At least one accepted invoice row is required',
        'NO_ACCEPTED_INVOICE_ROWS',
      );
    }
    const company = await this.companyRepository.findById(extraction.companyId);
    const companyKind = company?.kind ?? CompanyKind.AGRICULTURAL;
    assertConfirmableInvoiceEntries({
      entries: acceptedEntries,
      allowReviewOverride: requestData?.allowReviewOverride ?? false,
      companyKind,
    });
    if (this.logEditUseCase && (requestData?.invoiceEntries || requestData?.allowReviewOverride)) {
      await this.logEditUseCase.execute({
        extractionId: extraction.id,
        source: 'CONFIRM_OVERRIDE',
        before: { entries: data.entries },
        after: {
          entries: reconciledEntries,
          allowReviewOverride: requestData.allowReviewOverride ?? false,
        },
        userId: requestData.actorUserId ?? extraction.userId,
      });
    }
    const products = mapInvoiceEntriesToProducts({
      entries: acceptedEntries,
      fileId: extraction.fileId,
      extractionId: extraction.id,
      isDdtCategory: extraction.category === 'ddt',
      companyKind,
    });
    const result = await this.productStockUseCase.execute({
      companyId: extraction.companyId,
      warehouseId: requestData?.warehouseId,
      products,
    });
    await this.fileExtractionRepository.update(extraction.id, {
      extractedData: {
        ...data,
        entries: reconciledEntries,
      } as InvoiceExtractionData,
    });
    return {
      productsCreated: result.productsCreated,
      productsUpdated: result.productsUpdated,
      stocksCreated: result.stocksCreated,
    };
  }
