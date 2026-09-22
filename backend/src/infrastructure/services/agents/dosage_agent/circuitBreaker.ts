/**
 * Circuit Breaker pattern implementation for LLM API calls.
 * Prevents cascading failures when the LLM service is unavailable.
 */

export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation, requests pass through
  OPEN = 'OPEN', // Circuit tripped, requests fail fast
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  readonly failureThreshold: number;
  /** Time in ms to wait before attempting recovery (half-open state) */
  readonly resetTimeoutMs: number;
  /** Number of successful calls in half-open state to close the circuit */
  readonly successThreshold: number;
}

export interface CircuitBreakerStats {
  readonly state: CircuitState;
  readonly failures: number;
  readonly successes: number;
  readonly lastFailureTime: Date | null;
  readonly lastSuccessTime: Date | null;
  readonly totalRequests: number;
  readonly totalFailures: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  successThreshold: 2,
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  isOpen(): boolean {
    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      if (this.lastFailureTime) {
        const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
        if (timeSinceFailure >= this.config.resetTimeoutMs) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return false;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Execute a function with circuit breaker protection.
   * Throws CircuitBreakerOpenError if circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.isOpen()) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker '${this.name}' is open. Service temporarily unavailable.`,
        this.getStats(),
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Try to execute a function, returning a fallback value if circuit is open or execution fails.
   */
  async tryExecute<T>(
    fn: () => Promise<T>,
    fallback: T,
  ): Promise<{ result: T; fromFallback: boolean }> {
    try {
      const result = await this.execute(fn);
      return { result, fromFallback: false };
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        console.warn(`[CIRCUIT-BREAKER] ${this.name}: returning fallback due to open circuit`);
      } else {
        console.warn(`[CIRCUIT-BREAKER] ${this.name}: returning fallback due to error:`, error);
      }
      return { result: fallback, fromFallback: true };
    }
  }

  private onSuccess(): void {
    this.lastSuccessTime = new Date();
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.totalFailures++;
    this.lastFailureTime = new Date();
    this.successes = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failures >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }

    console.log(`[CIRCUIT-BREAKER] ${this.name}: ${oldState} -> ${newState}`);
  }

  /**
   * Manually reset the circuit breaker to closed state.
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.lastFailureTime = null;
  }
}

export class CircuitBreakerOpenError extends Error {
  readonly stats: CircuitBreakerStats;

  constructor(message: string, stats: CircuitBreakerStats) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.stats = stats;
  }
}

// Singleton instances for different LLM services
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>,
): CircuitBreaker {
  let breaker = circuitBreakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, config);
    circuitBreakers.set(name, breaker);
  }
  return breaker;
}

// Pre-configured circuit breakers for common use cases
export const LLM_CROP_MATCHER_BREAKER = 'llm-crop-matcher';
export const LLM_DOSAGE_BREAKER = 'llm-dosage';
export const LLM_PRODUCT_SELECTION_BREAKER = 'llm-product-selection';
export const LLM_COMPATIBILITY_BREAKER = 'llm-compatibility';
