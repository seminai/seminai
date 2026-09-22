import { FertilizerLabel } from '../dtos/fertilizer-label.dto';
import { Label } from '../dtos/label.dto';

export enum LabelCategory {
  FERTILIZER = 'FERTILIZER',
  FITO = 'FITO',
}

export enum LabelRefreshStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export interface FindLabelExtractionInput {
  productName: string;
  registrationNumber: string;
}

export interface LabelExtractionRecord {
  id: string;
  productName: string;
  registrationNumber: string;
  normalizedProductName: string | null;
  normalizedRegistrationNumber: string | null;
  sourceUrl: string;
  sourcePdfHash: string | null;
  rawTextHash: string | null;
  officialSourceUrl: string | null;
  category: LabelCategory;
  label: Label | FertilizerLabel;
  rawText: string;
  extractionConfidence: number;
  isVerified: boolean;
  extractedFields: string[];
  errors: string[];
  qualityExtraction: number[];
  lastRefreshedAt: Date | null;
  lastRefreshStatus: LabelRefreshStatus | null;
  lastRefreshError: string | null;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedReason: string | null;
  canonicalLabelExtractionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedLabelExtraction {
  productName: string;
  registrationNumber: string;
  sourceUrl: string;
  sourcePdfHash?: string | null;
  rawTextHash?: string | null;
  officialSourceUrl?: string | null;
  category: LabelCategory;
  label: Label | FertilizerLabel;
  rawText: string;
  extractionConfidence: number;
  extractedFields: string[];
  errors: string[];
  qualityExtraction: number[];
  lastRefreshedAt?: Date | null;
  lastRefreshStatus?: LabelRefreshStatus | null;
  lastRefreshError?: string | null;
}

export interface SearchByProductNameInput {
  productName: string;
  registrationNumber?: string;
  limit?: number;
}

export interface ILabelExtractionRepository {
  findById(id: string): Promise<LabelExtractionRecord | null>;
  findByProductAndRegistration(
    params: FindLabelExtractionInput,
  ): Promise<LabelExtractionRecord | null>;

  /**
   * Finds many label extractions by pairs (productName, registrationNumber).
   * Returns only the records that exist; missing pairs are omitted.
   */
  findManyByProductAndRegistration(
    params: ReadonlyArray<FindLabelExtractionInput>,
  ): Promise<ReadonlyArray<LabelExtractionRecord>>;

  /**
   * Searches label extractions by product name (case-insensitive, contains match).
   * Optionally filters by registrationNumber with format normalization.
   * Returns most recent first, limited to `limit` results (default 5).
   */
  searchByProductName(
    params: SearchByProductNameInput,
  ): Promise<ReadonlyArray<LabelExtractionRecord>>;

  saveExtraction(input: SavedLabelExtraction): Promise<LabelExtractionRecord>;

  /**
   * Returns all stored label extraction records.
   */
  listAll(options?: { includeArchived?: boolean }): Promise<LabelExtractionRecord[]>;

  /**
   * Deletes many label extractions by ids. Returns number of deleted records.
   */
  deleteManyByIds(ids: ReadonlyArray<string>): Promise<number>;

  /**
   * Updates a label extraction by id. Returns the updated record or null if not found.
   */
  updateById(
    id: string,
    input: Partial<SavedLabelExtraction>,
  ): Promise<LabelExtractionRecord | null>;

  /**
   * Updates the isVerified field of a label extraction by id. Returns the updated record or null if not found.
   */
  updateVerificationStatus(id: string, isVerified: boolean): Promise<LabelExtractionRecord | null>;

  /**
   * Deletes label extractions with extractionConfidence === 0 AND empty dosaggi_dettagliati.
   * Intended for one-time cleanup of labels produced by failed extraction attempts.
   * Returns the number of deleted records.
   */
  deleteEmptyExtractions(): Promise<number>;
}
