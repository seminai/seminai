import { type FileExtractionEditSource } from '@prisma/client';

export interface LogFileExtractionEditInput {
  readonly extractionId: string;
  readonly source: FileExtractionEditSource;
  readonly before: unknown | null;
  readonly after: unknown;
  readonly userId: string | null;
}

export interface FileExtractionEditLogResponse {
  readonly id: string;
  readonly extractionId: string;
  readonly version: number;
  readonly source: FileExtractionEditSource;
  readonly beforeData: unknown | null;
  readonly afterData: unknown;
  readonly userId: string | null;
  readonly createdAt: string;
}
