/**
 * Unit tests for dosage agent critical functions
 */

/**
 * Unit tests for dosage agent critical functions
 */
import { CircuitBreaker, CircuitState, CircuitBreakerOpenError } from '../infrastructure/services/agents/dosage_agent/circuitBreaker';
import { classifyLlmError, LlmErrorType } from '../infrastructure/services/agents/dosage_agent/llmErrorHandler';
import { resolveCycleIdFromCache, ProductionUnitWithCycles } from '../infrastructure/services/agents/dosage_agent/batchLoader';
describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should start in closed state', () => {
    const breaker = new CircuitBreaker('test');
    const stats = breaker.getStats();
    expect(stats.state).toBe(CircuitState.CLOSED);
  });

  it('should open after reaching failure threshold', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3 });

    // Simulate 3 failures
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }
    }

    expect(breaker.getStats().state).toBe(CircuitState.OPEN);
  });

  it('should reject calls when open', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1 });

    // Trip the breaker
    try {
      await breaker.execute(async () => {
        throw new Error('test error');
      });
    } catch {
      // Expected
    }

    // Should throw CircuitBreakerOpenError
    await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('should transition to half-open after reset timeout', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
    });

    // Trip the breaker
    try {
      await breaker.execute(async () => {
        throw new Error('test error');
      });
    } catch {
      // Expected
    }

    expect(breaker.getStats().state).toBe(CircuitState.OPEN);

    // Advance time past reset timeout
    jest.advanceTimersByTime(1001);

    // isOpen() should now return false (transitioning to half-open)
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN);
  });

  it('should close after successful calls in half-open state', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      successThreshold: 2,
    });

    // Trip the breaker
    try {
      await breaker.execute(async () => {
        throw new Error('test error');
      });
    } catch {
      // Expected
    }

    // Advance to half-open
    jest.advanceTimersByTime(1001);
    breaker.isOpen(); // Trigger state transition

    // Make successful calls
    await breaker.execute(async () => 'success1');
    await breaker.execute(async () => 'success2');

    expect(breaker.getStats().state).toBe(CircuitState.CLOSED);
  });

  it('tryExecute should return fallback when circuit is open', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1 });

    // Trip the breaker
    try {
      await breaker.execute(async () => {
        throw new Error('test error');
      });
    } catch {
      // Expected
    }

    const result = await breaker.tryExecute(async () => 'success', 'fallback');

    expect(result.result).toBe('fallback');
    expect(result.fromFallback).toBe(true);
  });
});

describe('LLM Error Classification', () => {
  it('should classify timeout errors', () => {
    const error = new Error('Request timed out');
    const classified = classifyLlmError(error);
    expect(classified.type).toBe(LlmErrorType.TIMEOUT);
    expect(classified.retryable).toBe(true);
  });

  it('should classify rate limit errors', () => {
    const error = new Error('429 Too many requests');
    const classified = classifyLlmError(error);
    expect(classified.type).toBe(LlmErrorType.RATE_LIMITED);
    expect(classified.retryable).toBe(true);
  });

  it('should classify service unavailable errors', () => {
    const error = new Error('503 Service unavailable');
    const classified = classifyLlmError(error);
    expect(classified.type).toBe(LlmErrorType.SERVICE_UNAVAILABLE);
    expect(classified.retryable).toBe(true);
  });

  it('should classify parsing errors', () => {
    const error = new Error('Unexpected token in JSON');
    const classified = classifyLlmError(error);
    expect(classified.type).toBe(LlmErrorType.INVALID_RESPONSE);
    expect(classified.retryable).toBe(true);
  });

  it('should classify circuit breaker errors', () => {
    const error = new CircuitBreakerOpenError('Circuit is open', {
      state: CircuitState.OPEN,
      failures: 5,
      successes: 0,
      lastFailureTime: new Date(),
      lastSuccessTime: null,
      totalRequests: 5,
      totalFailures: 5,
    });
    const classified = classifyLlmError(error);
    expect(classified.type).toBe(LlmErrorType.CIRCUIT_OPEN);
    expect(classified.retryable).toBe(false);
  });

  it('should classify unknown errors', () => {
    const error = new Error('Some random error');
    const classified = classifyLlmError(error);
    expect(classified.type).toBe(LlmErrorType.UNKNOWN);
    expect(classified.retryable).toBe(false);
  });

  it('should have user-friendly messages', () => {
    const error = new Error('Rate limit exceeded');
    const classified = classifyLlmError(error);
    expect(classified.userMessage).toContain('richieste');
  });
});

describe('Batch Loader - resolveCycleIdFromCache', () => {
  const mockUnit: ProductionUnitWithCycles = {
    id: 'unit-1',
    name: 'Test Unit',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    cycles: [
      {
        id: 'cycle-1',
        seasonYear: 2024,
        cycleIndex: 1,
        harvestingDate: new Date('2024-07-15'),
        floweringDate: new Date('2024-05-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
        productionUnitId: 'unit-1',
        cropName: 'Vite',
        cropType: 'Perenne',
        variety: 'Sangiovese',
        protocoll: 'BIO',
        protectionStructure: 'Scoperto',
        occupazione: null,
        destinazioneDiUso: null,
        acquaTotalePeridoL: 0,
      },
      {
        id: 'cycle-2',
        seasonYear: 2024,
        cycleIndex: 2,
        harvestingDate: new Date('2024-10-15'),
        floweringDate: new Date('2024-08-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
        productionUnitId: 'unit-1',
        cropName: 'Vite',
        cropType: 'Perenne',
        variety: 'Sangiovese',
        protocoll: 'BIO',
        protectionStructure: 'Scoperto',
        occupazione: null,
        destinazioneDiUso: null,
        acquaTotalePeridoL: 0,
      },
    ],
  };

  it('should return provided cycleId if present', () => {
    const result = resolveCycleIdFromCache(mockUnit, 'provided-cycle-id');
    expect(result).toBe('provided-cycle-id');
  });

  it('should return null for undefined unit data', () => {
    const result = resolveCycleIdFromCache(undefined, undefined);
    expect(result).toBeNull();
  });

  it('should return null for unit with no cycles', () => {
    const emptyUnit: ProductionUnitWithCycles = {
      ...mockUnit,
      cycles: [],
    };
    const result = resolveCycleIdFromCache(emptyUnit, undefined);
    expect(result).toBeNull();
  });

  it('should return first cycle for annual crops without treatment date', () => {
    const result = resolveCycleIdFromCache(mockUnit, undefined);
    expect(result).toBe('cycle-1');
  });

  it('should select cycle matching treatment year', () => {
    const treatmentDate = new Date('2024-06-01');
    const result = resolveCycleIdFromCache(mockUnit, undefined, treatmentDate);
    expect(result).toBe('cycle-1');
  });
});
