/**
 * Cascade flags for bulk file deletion.
 *
 * Each flag triggers the deletion of all records of a given entity type within
 * the target company, in addition to the file rows themselves. Stocks linked
 * to deleted files via `sourceFileId` are always removed (no flag required).
 */
export interface DeleteFilesBulkCascade {
  readonly fields?: boolean;
  readonly productionUnits?: boolean;
  readonly stocksAll?: boolean;
  readonly productsAll?: boolean;
  readonly fieldNotes?: boolean;
}

export interface DeleteFilesBulkResult {
  readonly deletedFiles: number;
  readonly deletedExtractions: number;
  readonly deletedStocksBySource: number;
  readonly deletedStocksByCompany: number;
  readonly deletedFields: number;
  readonly deletedProductionUnits: number;
  readonly deletedProducts: number;
  readonly deletedFieldNotes: number;
}

export interface DeleteFilesBulkDTO {
  readonly ids: readonly string[];
  readonly companyId: string;
  /**
   * FileExtraction ids to remove together with the files. Used for archive rows
   * that exist as extractions but have no `File` row yet (e.g. PDFs still in
   * PENDING_CONFIRMATION), and to clear extractions linked to deleted files.
   */
  readonly extractionIds?: readonly string[];
  readonly cascade?: DeleteFilesBulkCascade;
}
