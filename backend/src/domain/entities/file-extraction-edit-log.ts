import { type FileExtractionEditSource } from '@prisma/client';

/**
 * Immutable record of a single edit applied to FileExtraction.extractedData.
 * Append-only: rows are written by LogFileExtractionEditUseCase and never mutated.
 */
export class FileExtractionEditLog {
  constructor(
    public readonly id: string,
    public readonly extractionId: string,
    public readonly version: number,
    public readonly source: FileExtractionEditSource,
    public readonly beforeData: unknown | null,
    public readonly afterData: unknown,
    public readonly userId: string | null,
    public readonly createdAt: Date,
  ) {}
}
