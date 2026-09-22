import type { BaseMessage } from '@langchain/core/messages';

/**
 * Minimal interface for any LangGraph agent app that supports HITL operations.
 * Both DosageReactAgent and FieldNoteAgent satisfy this contract.
 *
 * Uses loose parameter types (`Record<string, unknown>`) for `stream` and
 * `getState` so that concrete agent app types (which carry richer signatures
 * from LangGraph's `Runnable`) remain assignable without explicit casting.
 */
export interface HitlAgentApp {
  stream(input: unknown, options?: Record<string, unknown>): Promise<AsyncIterable<unknown>>;
  getState(config: Record<string, unknown>): Promise<{ values: { messages: BaseMessage[] } }>;
  updateState(
    config: Record<string, unknown>,
    update: Record<string, unknown>,
    asNode?: string,
  ): Promise<unknown>;
}

/** Configuration passed to every HITL operation. */
export interface HitlConfig {
  readonly configurable: { readonly thread_id: string };
  readonly recursionLimit?: number;
  readonly durability?: string;
  readonly [key: string]: unknown;
}

/** Pending tool call surfaced to the caller / frontend. */
export interface HitlPendingToolCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly id?: string;
}

/** Standard response returned by any HITL approve/reject operation. */
export interface HitlResponse {
  readonly status: 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';
  readonly message?: string;
  readonly pendingToolCalls?: ReadonlyArray<HitlPendingToolCall>;
  readonly error?: string;
}
