/**
 * Timeout utility for wrapping async tool operations.
 * Uses Promise.race to enforce a maximum execution time.
 */

export class TimeoutError extends Error {
  constructor(operationName: string, timeoutMs: number) {
    super(`Operation "${operationName}" timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName = 'unknown',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function withAbortableTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  operationName = 'unknown',
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Default timeouts by operation category (in milliseconds) */
export const TOOL_TIMEOUTS = {
  /** Product matching: label extraction + LLM crop matching */
  SEARCH_PRODUCTS: 120_000,
  /** Dosage calculation: phenology + treatment planning per unit */
  CALCULATE_DOSAGE: 180_000,
  /** Compliance check: RAG + LLM validation */
  VALIDATE_COMPLIANCE: 120_000,
  /** BDF API enrichment */
  ENRICH_BDF: 30_000,
  /** Buffer zone extraction (single LLM call) */
  EXTRACT_BUFFER_ZONES: 30_000,
  /** Cycle expansion (DB query) */
  EXPAND_CYCLES: 30_000,
  /** Strategy planning (LLM call) */
  PLAN_STRATEGY: 60_000,
  /** Stock calculation (pure computation) */
  CALCULATE_STOCK: 10_000,
  /** Compatibility check (LLM call) */
  CHECK_COMPATIBILITY: 60_000,
  /** SA Group validation */
  VALIDATE_SA_GROUPS: 60_000,
  /** Dosage optimization */
  OPTIMIZE_DOSAGE: 30_000,
  /** Job creation (DB writes) */
  CREATE_JOBS: 60_000,
  /** Fertilizer plan optimization (LP solver + CSV reads) */
  FERTILIZER_PLAN: 30_000,
  /** Plant disease/pest diagnosis from a photo (single vision call) */
  DIAGNOSE_PHOTO: 45_000,
} as const;
