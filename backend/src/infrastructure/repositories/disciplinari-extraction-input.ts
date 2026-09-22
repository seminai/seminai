export interface DisciplinariExtractionInput {
  readonly fileHash: string;
  readonly fileName: string;
  readonly sourceUrl?: string;
  readonly region: string;
  readonly year: number;
  readonly version?: string;
  readonly title: string;
  readonly validFrom?: Date;
  readonly validUntil?: Date;
  readonly isExpired?: boolean;
  readonly rawText: string;
  readonly extractedData: unknown;
  readonly extractionConfidence: number;
  readonly extractionErrors: string[];
  readonly createdById?: string;
}
