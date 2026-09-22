export type LabelRefreshMode = 'stale' | 'all' | 'ids';

export interface LabelRefreshJobData {
  readonly mode: LabelRefreshMode;
  readonly labelExtractionIds?: readonly string[];
  readonly limit?: number;
  readonly dryRun?: boolean;
}

export interface LabelRefreshItemResult {
  readonly labelExtractionId: string;
  readonly productName: string;
  readonly registrationNumber: string;
  readonly status: 'refreshed' | 'unchanged' | 'failed' | 'skipped';
  readonly error?: string;
}

export interface LabelRefreshJobResult {
  readonly scanned: number;
  readonly refreshed: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly skipped: number;
  readonly archivedDuplicates: number;
  readonly aliasesCreated: number;
  readonly results: readonly LabelRefreshItemResult[];
}
