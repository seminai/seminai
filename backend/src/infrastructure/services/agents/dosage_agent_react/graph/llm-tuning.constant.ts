/**
 * LLM tuning knobs for the Dosage ReAct Agent.
 *
 * - DOSAGE_REACT_MAX_TOKENS caps the completion size per LLM invocation.
 *   Older `dosage_agent` flows use 4000 for the main agent — same cap applied here
 *   so runaway responses don't inflate cost when the model spins.
 *
 * - PROMPT_CACHE_KEY_PREFIX is the namespace prefix for OpenAI's prompt cache routing
 *   key. The full key bucketises requests by user (and workspace, when available),
 *   so identical prefixes (system prompt + tool schemas) land on the same cache
 *   shard for the same caller — increasing hit rate on the cacheable prefix.
 */
export const DOSAGE_REACT_MAX_TOKENS = 4000;

const PROMPT_CACHE_KEY_PREFIX = 'seminai-dosage-react';

export interface PromptCacheKeyParts {
  readonly userId?: string;
  readonly workspaceId?: string;
  /**
   * Active intent bundle (e.g. DOSAGE, FULL). Bucketises cache per bundle so
   * different bundles — which expose different tool schema prefixes — don't
   * collide on the same cache shard and erode hit rate.
   */
  readonly bundle?: string;
}

export function buildPromptCacheKey(parts: PromptCacheKeyParts): string {
  const userPart = parts.userId ?? 'anon';
  const workspacePart = parts.workspaceId ?? 'default';
  const bundlePart = parts.bundle ?? 'full';
  return `${PROMPT_CACHE_KEY_PREFIX}:${userPart}:${workspacePart}:${bundlePart.toLowerCase()}`;
}
