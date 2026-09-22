/**
 * Structured telemetry for the extraction pipeline.
 *
 * Emits a single JSON line per document so we can grep/dashboard the success
 * rate of the LLM channel vs. the deterministic fallback, the percentage of
 * rows flagged as `needsReview`, and the characteristics of the input (size of
 * native vs. OCR text, number of tables detected, etc.).
 *
 * The log line is prefixed by `[EXTRACTION_TELEMETRY]` so ops can quickly
 * filter for it in the container output.
 */

export type ExtractionChannel = 'llm-primary' | 'deterministic-fallback' | 'fattura-pa-xml';

export interface ExtractionTelemetryPayload {
  readonly documentKind: 'invoice' | 'ddt';
  readonly filePath: string;
  readonly channel: ExtractionChannel;
  readonly durationMs: number;
  readonly ocrProvider: string;
  readonly ocrModel?: string;
  readonly pagesProcessed?: number;
  readonly nativeTextLength: number;
  readonly ocrTextLength: number;
  readonly tablesDetected: number;
  readonly tableRowsDetected: number;
  readonly entriesExtracted: number;
  readonly needsReviewCount: number;
  readonly error?: string;
}

export function recordExtractionTelemetry(payload: ExtractionTelemetryPayload): void {
  const event = {
    event: 'extraction_completed',
    timestamp: new Date().toISOString(),
    ...payload,
  };
  try {
    console.log('[EXTRACTION_TELEMETRY]', JSON.stringify(event));
  } catch {
    // Never let telemetry break the extraction flow.
  }
}

export interface BatchPhaseTimingsPayload {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly category: string;
  readonly outcome: 'success' | 'error';
  readonly phases: Readonly<Record<string, number>>;
  readonly totalMs: number;
  readonly error?: string;
}

/**
 * Per-phase timings for a single file in a batch extraction.
 * Logged separately so ops can compute p95 latency by phase
 * (fileUpload, categoryResolve, extraction, dbUpdate, …) and
 * identify the dominant bottleneck per file/category in production.
 */
export function recordBatchPhaseTimings(payload: BatchPhaseTimingsPayload): void {
  const event = {
    event: 'batch_phase_timings',
    timestamp: new Date().toISOString(),
    ...payload,
  };
  try {
    console.log('[BATCH_PHASE_TIMINGS]', JSON.stringify(event));
  } catch {
    // Never let telemetry break the extraction flow.
  }
}
