/**
 * Abstraction for product + LLM analytics (PostHog).
 *
 * Defined in the domain so application/infrastructure code can emit events
 * without depending on a concrete analytics SDK. The infrastructure adapter
 * implements this against PostHog; a no-op implementation is used when no
 * project key is configured (local dev / tests).
 *
 * All capture methods are fire-and-forget: they MUST NOT throw into callers
 * and MUST NOT block the caller's critical path.
 */

/** Scalar-only property values — keeps PII-bearing nested payloads out of events. */
export type AnalyticsPropertyValue = string | number | boolean | null;

/** Group association for B2B group analytics, e.g. `{ type: 'workspace', key }`. */
export interface AnalyticsGroup {
  readonly type: string;
  readonly key: string;
}

/** Input for a generic product event. */
export interface AnalyticsCaptureInput {
  readonly distinctId: string;
  readonly event: string;
  readonly properties?: Readonly<Record<string, AnalyticsPropertyValue | readonly string[]>>;
  readonly groups?: readonly AnalyticsGroup[];
}

/** Input for an LLM generation event (PostHog `$ai_generation` spec). */
export interface LlmGenerationInput {
  readonly distinctId: string;
  readonly model: string;
  readonly provider: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalCostUsd: number;
  readonly jobType: string;
  readonly latencyMs?: number;
  readonly groups?: readonly AnalyticsGroup[];
}

export interface IAnalyticsService {
  /** Captures a generic product event. */
  capture(input: AnalyticsCaptureInput): void;

  /** Captures an LLM generation event for cost/performance observability. */
  captureLlmGeneration(input: LlmGenerationInput): void;

  /** Flushes the pending event batch. Call once before the process exits. */
  shutdown(): Promise<void>;
}
