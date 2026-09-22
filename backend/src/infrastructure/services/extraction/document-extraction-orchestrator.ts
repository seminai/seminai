import { CompanyKind } from '@prisma/client';
import { ExtractDataFromInvoiceService } from '../tool/extractDataFromInvoice';
import { ExtractDataFromDdtService } from '../tool/extractDataFromDDT';
import type { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import type { DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import type { StockPreviewEntry } from '../agents/dosage_agent_react/tools/file-extraction-types';
import type { OcrProvider } from '../ocr/ocr-provider';

/**
 * Shared orchestrator that dispatches PDF/image documents to the correct
 * extractor based on the detected type (invoice vs. DDT) and maps the domain
 * entries to the `StockPreviewEntry` shape consumed by the chat pipeline.
 *
 * Before this module, ChatExtractionQueue routed both invoice and DDT to the
 * invoice extractor, which discarded DDT-specific metadata (ddtDate,
 * orderNumber) and occasionally misclassified shipments as invoices.
 */
export type DocumentKind = 'invoice' | 'ddt';

export interface OrchestratorResult {
  readonly kind: DocumentKind;
  readonly entries: ReadonlyArray<InvoiceEntry | DdtEntry>;
  readonly stockEntries: ReadonlyArray<StockPreviewEntry>;
  readonly rawTextPath: string;
  readonly needsReviewCount: number;
}

interface Dependencies {
  readonly invoiceService?: ExtractDataFromInvoiceService;
  readonly ddtService?: ExtractDataFromDdtService;
}

export class DocumentExtractionOrchestrator {
  private readonly invoiceService: ExtractDataFromInvoiceService;
  private readonly ddtService: ExtractDataFromDdtService;

  constructor(deps?: Dependencies) {
    this.invoiceService = deps?.invoiceService ?? new ExtractDataFromInvoiceService();
    this.ddtService = deps?.ddtService ?? new ExtractDataFromDdtService();
  }

  public async execute(params: {
    kind: DocumentKind;
    filePath: string;
    ocrProvider?: OcrProvider;
    companyKind?: CompanyKind;
  }): Promise<OrchestratorResult> {
    if (params.kind === 'ddt') {
      const { entries, rawTextPath } = await this.ddtService.execute({
        pdfPath: params.filePath,
        ocrProvider: params.ocrProvider,
        companyKind: params.companyKind,
      });
      return {
        kind: 'ddt',
        entries,
        stockEntries: entries.map(mapDdtToStockEntry),
        rawTextPath,
        needsReviewCount: countReview(entries),
      };
    }
    const { entries, rawTextPath } = await this.invoiceService.execute({
      filePath: params.filePath,
      ocrProvider: params.ocrProvider,
      companyKind: params.companyKind,
    });
    return {
      kind: 'invoice',
      entries,
      stockEntries: entries.map(mapInvoiceToStockEntry),
      rawTextPath,
      needsReviewCount: countReview(entries),
    };
  }
}

function mapInvoiceToStockEntry(entry: InvoiceEntry): StockPreviewEntry {
  return {
    name: entry.productName,
    category: entry.productCategory ?? 'OTHER',
    registrationNumber: entry.registrationNumber,
    stock: {
      quantity: entry.quantity ?? 0,
      unitOfMeasureQuantity: entry.quantityUnitOfMeasure ?? 'PZ',
      price: entry.unitPrice ?? entry.totalPrice ?? 0,
      type: 'IN',
      ddtCode: entry.invoiceNumber ?? '',
      ddtDate: entry.invoiceDate ?? new Date().toISOString(),
      invoiceCode: entry.invoiceNumber,
      companySupplierName: entry.supplierName,
    },
  };
}

function mapDdtToStockEntry(entry: DdtEntry): StockPreviewEntry {
  return {
    name: entry.productName,
    category: entry.productCategory ?? 'OTHER',
    registrationNumber: entry.registrationNumber,
    stock: {
      quantity: entry.quantity ?? 0,
      unitOfMeasureQuantity: entry.quantityUnitOfMeasure ?? 'PZ',
      price: entry.unitPrice ?? entry.totalPrice ?? 0,
      type: 'IN',
      ddtCode: entry.orderNumber ?? '',
      ddtDate: entry.ddtDate ?? new Date().toISOString(),
      invoiceCode: null,
      companySupplierName: entry.supplierName,
    },
  };
}

function countReview(entries: ReadonlyArray<{ needsReview?: boolean }>): number {
  return entries.filter((entry) => entry.needsReview).length;
}
