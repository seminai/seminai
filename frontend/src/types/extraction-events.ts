import type { ResolvedCategory } from './extraction';

export interface ExtractionProgressEvent {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly progress: number;
}

export interface ExtractionCompletedEvent {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly category: ResolvedCategory;
  readonly status: 'PENDING_CONFIRMATION';
}

export interface ExtractionErrorEvent {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly error: string;
}

export interface ExtractionDoneEvent {
  readonly batchId: string;
}

export type EntityType =
  | 'fields'
  | 'production-units'
  | 'products'
  | 'company'
  | 'jobs'
  | 'field-notes';

interface ArchiveRowBase {
  readonly id: string;
  readonly titolo: string;
  readonly azienda: string;
  readonly aggiornato: string;
  readonly aggiornatoIso: string;
  readonly status: string;
  readonly tipoDiFile: string;
  readonly formato: string;
  readonly note: string;
}

export interface ExtractionArchiveRow extends ArchiveRowBase {
  readonly kind: 'extraction';
  readonly extractionId: string;
  readonly batchId: string;
  readonly progress: number;
  readonly fileUrl: string | null;
  readonly fileId: string | null;
  readonly companyId: string;
  readonly category: ResolvedCategory;
}

export interface EntityArchiveRow extends ArchiveRowBase {
  readonly kind: 'entity';
  readonly entityType: EntityType;
  readonly companyId: string;
  readonly jobId?: string;
  readonly totalOperations?: number;
  readonly verifiedOperations?: number;
  readonly pendingOperations?: number;
}

export interface DosageJobArchiveRow extends ArchiveRowBase {
  readonly kind: 'dosage-job';
  readonly jobId: string;
  readonly progress: number;
  readonly state: string;
}

export type ArchiveRow = ExtractionArchiveRow | EntityArchiveRow | DosageJobArchiveRow;
