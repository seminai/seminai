import { Prisma, LlmJobType } from '@prisma/client';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { UsageAccumulator } from './usage';


export type LlmUsageMetadata = {
  readonly userId?: string;
  readonly companyId?: string;
  readonly jobId?: string;
  readonly jobGroupId?: string;
  readonly jobType: LlmJobType;
  readonly model: string;
  readonly metadata?: Prisma.InputJsonValue | null;
  readonly margin?: number;
};


export type UsageTracker = {
  readonly accumulator: UsageAccumulator;
  readonly callbacks: BaseCallbackHandler[];
};


export type UsageRecord = {
  readonly userId: string;
  readonly companyId: string | null;
  readonly jobId: string | null;
  readonly jobGroupId: string | null;
  readonly jobType: LlmJobType;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly cachedTokens: number;
  readonly cost: number;
  readonly seminaiMargin: number;
  readonly costClient: number;
  readonly metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};


/** Metadata for a provider fallback event */
export type FallbackEventMeta = {
  readonly userId?: string;
  readonly companyId?: string;
  readonly jobId?: string;
  readonly operation: string;
  readonly primaryProvider: string;
  readonly primaryModel: string;
  readonly fallbackProvider: string;
  readonly fallbackModel: string;
  readonly errorType: string;
  readonly errorMessage: string;
};


/** In-memory provider usage statistics */
export interface ProviderStats {
  claudeCalls: number;
  claudeSuccesses: number;
  openaiCalls: number;
  openaiSuccesses: number;
  openrouterCalls: number;
  openrouterSuccesses: number;
  providerCalls: Record<string, number>;
  providerSuccesses: Record<string, number>;
  fallbackEvents: number;
  fallbackReasons: Record<string, number>;
}


export const DEFAULT_MARGIN: number = 0.3;

export const BATCH_SIZE = 10;

export const FLUSH_INTERVAL_MS = 5000;

export const MAX_RETRIES = 3;

export const INITIAL_BACKOFF_MS = 500;

export const FALLBACK_RATE_ALERT_THRESHOLD = 0.2;
