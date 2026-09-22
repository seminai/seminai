import type { Request } from 'express';
import type { AnalyticsGroup } from '../../domain/services/IAnalyticsService';

/**
 * Analytics context derived from an authenticated request: the PostHog
 * `distinctId` (the user id — shared with the frontend `identify` and the LLM
 * usage logger so timelines unify across layers) and the B2B group(s).
 */
export interface AnalyticsRequestContext {
  readonly distinctId: string;
  readonly groups: AnalyticsGroup[];
}

/** Reads `companyId` / `workspaceId` from a request body without using `any`. */
function readGroups(body: unknown): AnalyticsGroup[] {
  const source = (body ?? {}) as Record<string, unknown>;
  const companyId = typeof source.companyId === 'string' ? source.companyId : undefined;
  const workspaceId = typeof source.workspaceId === 'string' ? source.workspaceId : undefined;
  const groups: AnalyticsGroup[] = [];
  if (companyId) groups.push({ type: 'company', key: companyId });
  if (workspaceId) groups.push({ type: 'workspace', key: workspaceId });
  return groups;
}

/** Builds the analytics context for a request (controller call sites). */
export function buildAnalyticsContext(req: Request): AnalyticsRequestContext {
  return {
    distinctId: req.user?.id ?? '',
    groups: readGroups(req.body),
  };
}
