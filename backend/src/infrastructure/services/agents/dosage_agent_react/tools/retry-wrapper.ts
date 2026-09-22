import { DynamicStructuredTool } from '@langchain/core/tools';

/** Maximum retry attempts before giving up. */
const MAX_RETRIES = 3;

/** Base delay between retries in milliseconds (doubles each attempt). */
const BASE_DELAY_MS = 1_000;

/**
 * Error patterns considered transient and worth retrying.
 * Includes network errors, rate limits, server errors, and Prisma connection issues.
 */
const RETRYABLE_PATTERNS = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /EPIPE/i,
  /socket hang up/i,
  /fetch failed/i,
  /network/i,
  /429/,
  /503/,
  /502/,
  /UNAVAILABLE/i,
  /Can't reach database server/i,
  /Connection timed out/i,
  /Too Many Requests/i,
] as const;

/**
 * Determines if an error is transient and should be retried.
 */
function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Sleeps for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Options for the generic `retryWithBackoff` helper.
 */
export interface RetryOptions {
  /** Maximum attempts including the first try. Defaults to MAX_RETRIES. */
  attempts?: number;
  /** Base delay between retries in ms; doubles each attempt. Defaults to BASE_DELAY_MS. */
  baseMs?: number;
  /** Observer for each retried attempt (logging, telemetry). */
  onAttemptFailure?: (attempt: number, error: unknown, nextDelayMs: number) => void;
}

/**
 * Generic exponential-backoff retry. Retries only on errors matching the
 * shared transient patterns (see RETRYABLE_PATTERNS). Throws the original
 * error on non-retryable failures or after `attempts` exhausted.
 *
 * Used by `wrapToolWithRetry` here and by `working-memory.ts:flushToDisk` to
 * survive transient DB hiccups during the debounced persistence path.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? MAX_RETRIES);
  const baseMs = Math.max(0, opts.baseMs ?? BASE_DELAY_MS);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) {
        break;
      }
      const delayMs = baseMs * Math.pow(2, attempt - 1);
      opts.onAttemptFailure?.(attempt, error, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/**
 * Wraps a DynamicStructuredTool with exponential-backoff retry for transient errors.
 * Non-retryable errors (validation, business logic) pass through immediately.
 * On final retry failure, returns a structured error with `retryExhausted: true`.
 */
export function wrapToolWithRetry(tool: DynamicStructuredTool): DynamicStructuredTool {
  const originalFunc = tool.func.bind(tool);

  const wrapped = new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    responseFormat: tool.responseFormat,
    returnDirect: tool.returnDirect,
    verboseParsingErrors: tool.verboseParsingErrors,
    func: async (input, runManager) => {
      try {
        return await retryWithBackoff(() => originalFunc(input, runManager), {
          attempts: MAX_RETRIES,
          baseMs: BASE_DELAY_MS,
          onAttemptFailure: (attempt, error, delayMs) =>
            console.warn(
              `[retry-wrapper] ${tool.name} attempt ${attempt}/${MAX_RETRIES} failed (retrying in ${delayMs}ms):`,
              error instanceof Error ? error.message : error,
            ),
        });
      } catch (lastError) {
        const errorMessage = lastError instanceof Error ? lastError.message : 'Errore sconosciuto';
        if (isRetryableError(lastError)) {
          return JSON.stringify({
            error: `${tool.name} non disponibile dopo ${MAX_RETRIES} tentativi: ${errorMessage}`,
            retryExhausted: true,
          });
        }
        throw lastError;
      }
    },
  });

  wrapped.extras = tool.extras;
  wrapped.defaultConfig = tool.defaultConfig;
  return wrapped;
}
