import { PostHogAnalyticsService } from './PostHogAnalyticsService';
import type { IAnalyticsService } from '../../../domain/services/IAnalyticsService';

let instance: IAnalyticsService | null = null;

/**
 * Returns the process-wide analytics service (lazy singleton).
 *
 * Each process (HTTP server, BullMQ worker) gets its own PostHog client, which
 * is correct for multi-instance deployments — each must `shutdown()` on exit.
 */
export function getAnalyticsService(): IAnalyticsService {
  if (!instance) {
    instance = new PostHogAnalyticsService();
  }
  return instance;
}
