import type { DdtEntry } from './ddt-entry.dto';
import type { InvoiceEntry } from './invoice-entry.dto';

export type ExtractionApiDocumentType = 'invoice' | 'ddt' | 'auto';

export type ExtractionApiResolvedDocumentType = 'invoice' | 'ddt';

export interface ExtractionApiAccountSummary {
  readonly pageQuota: number;
  readonly pagesUsed: number;
  readonly pagesRemaining: number;
}

export interface ExtractionApiKeySummary {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

export interface ExtractionApiKeyCreated {
  readonly key: ExtractionApiKeySummary;
  readonly secret: string;
}

export interface ExtractionApiUsageEntry {
  readonly id: string;
  readonly documentType: string;
  readonly detectedType: string | null;
  readonly fileName: string | null;
  readonly pagesProcessed: number;
  readonly pagesCharged: number;
  readonly createdAt: string;
}

export interface ExtractionApiBillingSummary {
  readonly pagesCharged: number;
  readonly quota: ExtractionApiAccountSummary;
}

export interface ExtractDocumentApiResult {
  readonly documentType: ExtractionApiResolvedDocumentType;
  readonly requestedDocumentType: ExtractionApiDocumentType;
  readonly pagesProcessed: number;
  readonly pagesCharged: number;
  readonly entries: ReadonlyArray<InvoiceEntry | DdtEntry>;
  readonly quota: ExtractionApiAccountSummary;
}
