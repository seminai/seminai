import { type FileExtractionEditSource } from '@prisma/client';

export interface AppendEditLogInput {
  readonly extractionId: string;
  readonly source: FileExtractionEditSource;
  readonly beforeData: unknown | null;
  readonly afterData: unknown;
  readonly userId: string | null;
}

export interface FileExtractionEditLogRecord {
  readonly id: string;
  readonly extractionId: string;
  readonly version: number;
  readonly source: FileExtractionEditSource;
  readonly beforeData: unknown | null;
  readonly afterData: unknown;
  readonly userId: string | null;
  readonly createdAt: Date;
}

export interface ExportEditLogsFilter {
  readonly since?: Date;
  readonly until?: Date;
  readonly companyId?: string;
}

export interface EditLogWithExtractionAndFileRecord {
  readonly extractionId: string;
  readonly category: string;
  readonly companyId: string;
  readonly fileName: string;
  readonly fileUrl: string | null;
  readonly logs: readonly FileExtractionEditLogRecord[];
}

export interface IFileExtractionEditLogRepository {
  /**
   * Appends a new log row computing the next version atomically.
   * Returns the created record.
   */
  append(input: AppendEditLogInput): Promise<FileExtractionEditLogRecord>;
  findByExtractionId(extractionId: string): Promise<readonly FileExtractionEditLogRecord[]>;
  /**
   * Loads CONFIRMED invoice/ddt extractions together with their full edit history
   * and the source File row, used to build the LLM optimization dataset.
   */
  findConfirmedInvoiceAndDdtLogs(
    filter: ExportEditLogsFilter,
  ): Promise<readonly EditLogWithExtractionAndFileRecord[]>;
}
