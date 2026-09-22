import { type DocumentCategory } from '@prisma/client';

/**
 * Source that resolved the company match for a pre-classified document.
 * - `vat_exact`: an Italian VAT / fiscal code / CUAA found in the text matched exactly one company.
 * - `only_company`: the user owns a single company, so it is the only possible reference.
 * - `llm`: the LLM picked a company from the provided list (above the confidence threshold).
 * - `none`: no company could be confidently resolved.
 */
export type CompanyMatchSource = 'vat_exact' | 'only_company' | 'llm' | 'none';

/** Lifecycle of a single file inside a pre-classification request. */
export type PreclassificationItemStatus = 'pending' | 'classified' | 'error';

/** Compact company projection handed to the classifier and the LLM prompt. */
export interface PreclassificationCompany {
  readonly id: string;
  readonly name: string;
  readonly vatNumber: string;
  readonly fiscalCode: string;
  readonly cuaa: string | null;
  readonly city: string | null;
}

/**
 * Outcome of pre-classifying one document: the detected category (or null when
 * below threshold) and the matched company (or null). Confidences are clamped to [0,1].
 */
export interface PreclassificationResult {
  readonly documentCategory: DocumentCategory | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
  readonly companyMatchSource: CompanyMatchSource;
  readonly reason: string;
}

/** A pre-classification result as stored in Redis (result + lifecycle metadata). */
export interface StoredPreclassificationItem {
  readonly itemId: string;
  readonly fileName: string;
  readonly status: PreclassificationItemStatus;
  readonly documentCategory: DocumentCategory | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
  readonly companyMatchSource: CompanyMatchSource;
  readonly error: string | null;
}

/** Per-file entry returned by POST /extractions/preclassify. */
export interface StartPreclassificationItemDto {
  readonly itemId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly status: PreclassificationItemStatus;
}

/** Response body of POST /extractions/preclassify. */
export interface StartPreclassificationResponseDto {
  readonly preclassId: string;
  readonly items: readonly StartPreclassificationItemDto[];
}

/** Per-file entry returned by GET /extractions/preclassify/:preclassId/status. */
export interface PreclassificationStatusItemDto {
  readonly itemId: string;
  readonly fileName: string;
  readonly status: PreclassificationItemStatus;
  readonly documentCategory: DocumentCategory | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
  readonly error: string | null;
}

/** Response body of GET /extractions/preclassify/:preclassId/status. */
export interface PreclassificationStatusResponseDto {
  readonly preclassId: string;
  readonly items: readonly PreclassificationStatusItemDto[];
}

/** Socket.IO payload emitted when a single file is classified. */
export interface PreclassificationItemEvent {
  readonly preclassId: string;
  readonly itemId: string;
  readonly fileName: string;
  readonly documentCategory: DocumentCategory | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
  readonly status: 'classified';
}

/** Socket.IO payload emitted when a single file fails to classify. */
export interface PreclassificationItemErrorEvent {
  readonly preclassId: string;
  readonly itemId: string;
  readonly fileName: string;
  readonly error: string;
}

/** Socket.IO payload emitted when every file of a request reached a terminal state. */
export interface PreclassificationDoneEvent {
  readonly preclassId: string;
}
