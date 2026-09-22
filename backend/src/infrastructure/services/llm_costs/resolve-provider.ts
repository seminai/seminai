/**
 * Resolves a coarse provider name from a model identifier.
 *
 * Handles gateway-prefixed ids (`openai/gpt-4o` → `openai`) and bare model
 * names (`claude-3-5-sonnet` → `anthropic`, `gpt-4o` → `openai`), defaulting
 * to `openrouter`. Shared by the usage logger and the analytics LLM hook.
 */
export function resolveProviderName(model: string): string {
  const normalized = model.toLowerCase();
  if (normalized.includes('/')) return normalized.split('/')[0];
  if (normalized.includes('claude')) return 'anthropic';
  if (normalized.includes('gpt')) return 'openai';
  return 'openrouter';
}
