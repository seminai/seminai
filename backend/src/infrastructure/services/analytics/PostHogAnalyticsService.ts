import { PostHog } from 'posthog-node';
import { logger } from '../logger.service';
import type {
  AnalyticsCaptureInput,
  AnalyticsGroup,
  IAnalyticsService,
  LlmGenerationInput,
} from '../../../domain/services/IAnalyticsService';

const DEFAULT_HOST = 'https://eu.i.posthog.com';
const LLM_GENERATION_EVENT = '$ai_generation';

/**
 * PostHog-backed analytics adapter (EU Cloud).
 *
 * Fire-and-forget: every method swallows errors so analytics can never break
 * or block a request / agent run. When `POSTHOG_API_KEY` is unset the client
 * is `null` and all methods become no-ops (local dev / tests — no network).
 */
export class PostHogAnalyticsService implements IAnalyticsService {
  private readonly client: PostHog | null;

  constructor() {
    const apiKey = process.env.POSTHOG_API_KEY;
    if (!apiKey) {
      this.client = null;
      logger.info('[ANALYTICS] PostHog disabled (POSTHOG_API_KEY not set) — no-op mode');
      return;
    }
    this.client = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST ?? DEFAULT_HOST,
    });
  }

  public capture(input: AnalyticsCaptureInput): void {
    if (!this.client || !input.distinctId) return;
    try {
      this.client.capture({
        distinctId: input.distinctId,
        event: input.event,
        properties: input.properties,
        groups: this.toGroups(input.groups),
      });
    } catch (err) {
      this.logFailure(input.event, err);
    }
  }

  public captureLlmGeneration(input: LlmGenerationInput): void {
    if (!this.client || !input.distinctId) return;
    try {
      this.client.capture({
        distinctId: input.distinctId,
        event: LLM_GENERATION_EVENT,
        properties: {
          $ai_model: input.model,
          $ai_provider: input.provider,
          $ai_input_tokens: input.inputTokens,
          $ai_output_tokens: input.outputTokens,
          $ai_total_cost_usd: input.totalCostUsd,
          $ai_latency: typeof input.latencyMs === 'number' ? input.latencyMs / 1000 : undefined,
          job_type: input.jobType,
        },
        groups: this.toGroups(input.groups),
      });
    } catch (err) {
      this.logFailure(LLM_GENERATION_EVENT, err);
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.shutdown();
    } catch (err) {
      this.logFailure('shutdown', err);
    }
  }

  private toGroups(groups?: readonly AnalyticsGroup[]): Record<string, string> | undefined {
    if (!groups || groups.length === 0) return undefined;
    return groups.reduce<Record<string, string>>((acc, group) => {
      if (group.key) acc[group.type] = group.key;
      return acc;
    }, {});
  }

  private logFailure(event: string, err: unknown): void {
    logger.warn('[ANALYTICS] capture failed', {
      event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
