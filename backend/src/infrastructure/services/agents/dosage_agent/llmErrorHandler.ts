/**
 * Centralized LLM error handling with user-friendly messages.
 * Provides consistent error handling across all LLM calls in the dosage agent.
 */

import { getCircuitBreaker, CircuitBreakerOpenError } from './circuitBreaker';

export enum LlmErrorType {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  UNKNOWN = 'UNKNOWN',
}

export interface LlmError {
  readonly type: LlmErrorType;
  readonly message: string;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly originalError?: unknown;
}

export interface LlmCallResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: LlmError;
  readonly fromFallback: boolean;
}

/**
 * Classify an error into a known LlmErrorType
 */
export function classifyLlmError(error: unknown): LlmError {
  if (error instanceof CircuitBreakerOpenError) {
    return {
      type: LlmErrorType.CIRCUIT_OPEN,
      message: error.message,
      userMessage:
        'Il servizio di intelligenza artificiale è temporaneamente non disponibile. I calcoli procedono con metodi alternativi.',
      retryable: false,
      originalError: error,
    };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: LlmErrorType.TIMEOUT,
        message: error.message,
        userMessage:
          'Il servizio AI ha impiegato troppo tempo. Il calcolo prosegue con metodi alternativi.',
        retryable: true,
        originalError: error,
      };
    }

    // Rate limiting
    if (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('too many requests')
    ) {
      return {
        type: LlmErrorType.RATE_LIMITED,
        message: error.message,
        userMessage: 'Limite di richieste raggiunto. Il calcolo prosegue con metodi alternativi.',
        retryable: true,
        originalError: error,
      };
    }

    // Service unavailable
    if (
      message.includes('503') ||
      message.includes('502') ||
      message.includes('500') ||
      message.includes('service unavailable') ||
      message.includes('internal server error')
    ) {
      return {
        type: LlmErrorType.SERVICE_UNAVAILABLE,
        message: error.message,
        userMessage:
          'Il servizio AI non è temporaneamente disponibile. Il calcolo prosegue con metodi alternativi.',
        retryable: true,
        originalError: error,
      };
    }

    // Invalid response / parsing errors
    if (
      message.includes('parse') ||
      message.includes('json') ||
      message.includes('invalid') ||
      message.includes('unexpected')
    ) {
      return {
        type: LlmErrorType.INVALID_RESPONSE,
        message: error.message,
        userMessage: 'Risposta AI non valida. Il calcolo prosegue con metodi alternativi.',
        retryable: true,
        originalError: error,
      };
    }
  }

  // Unknown error
  return {
    type: LlmErrorType.UNKNOWN,
    message: error instanceof Error ? error.message : String(error),
    userMessage: 'Errore nel servizio AI. Il calcolo prosegue con metodi alternativi.',
    retryable: false,
    originalError: error,
  };
}

/**
 * Log an LLM error with appropriate severity
 */
export function logLlmError(
  context: string,
  error: LlmError,
  additionalInfo?: Record<string, unknown>,
): void {
  const logData = {
    context,
    errorType: error.type,
    message: error.message,
    retryable: error.retryable,
    ...additionalInfo,
  };

  if (error.type === LlmErrorType.CIRCUIT_OPEN) {
    console.warn(`[LLM-ERROR] ${context}: Circuit breaker open`, logData);
  } else if (error.retryable) {
    console.warn(`[LLM-ERROR] ${context}: ${error.type}`, logData);
  } else {
    console.error(`[LLM-ERROR] ${context}: ${error.type}`, logData);
  }
}

/**
 * Execute an LLM call with error handling and circuit breaker protection.
 */
export async function executeLlmCallWithProtection<T>(params: {
  readonly circuitBreakerName: string;
  readonly operation: () => Promise<T>;
  readonly fallback: T;
  readonly context: string;
  readonly additionalInfo?: Record<string, unknown>;
}): Promise<LlmCallResult<T>> {
  const { circuitBreakerName, operation, fallback, context, additionalInfo } = params;
  const circuitBreaker = getCircuitBreaker(circuitBreakerName);

  try {
    const result = await circuitBreaker.execute(operation);
    return {
      success: true,
      data: result,
      fromFallback: false,
    };
  } catch (error) {
    const llmError = classifyLlmError(error);
    logLlmError(context, llmError, additionalInfo);

    return {
      success: false,
      data: fallback,
      error: llmError,
      fromFallback: true,
    };
  }
}

/**
 * Wrapper for LLM batch operations with progress tracking.
 */
export async function executeLlmBatchWithProtection<TInput, TOutput>(params: {
  readonly circuitBreakerName: string;
  readonly items: ReadonlyArray<TInput>;
  readonly operation: (item: TInput) => Promise<TOutput>;
  readonly fallback: (item: TInput) => TOutput;
  readonly context: string;
  readonly onProgress?: (completed: number, total: number, failures: number) => void;
}): Promise<{
  readonly results: Map<TInput, TOutput>;
  readonly failures: number;
  readonly totalFromFallback: number;
}> {
  const { circuitBreakerName, items, operation, fallback, context, onProgress } = params;
  const results = new Map<TInput, TOutput>();
  let failures = 0;
  let totalFromFallback = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = await executeLlmCallWithProtection({
      circuitBreakerName,
      operation: () => operation(item),
      fallback: fallback(item),
      context: `${context} [${i + 1}/${items.length}]`,
    });

    if (result.success && result.data !== undefined) {
      results.set(item, result.data);
    } else {
      failures++;
      if (result.fromFallback && result.data !== undefined) {
        results.set(item, result.data);
        totalFromFallback++;
      }
    }

    onProgress?.(i + 1, items.length, failures);
  }

  return { results, failures, totalFromFallback };
}

/**
 * Collection of user-facing warning messages for LLM failures.
 * To be included in API responses.
 */
export interface LlmWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly affectedOperation: string;
}

export function createLlmWarning(error: LlmError, affectedOperation: string): LlmWarning {
  return {
    code: `LLM_${error.type}`,
    message: error.userMessage,
    severity: error.type === LlmErrorType.CIRCUIT_OPEN ? 'warning' : 'info',
    affectedOperation,
  };
}
