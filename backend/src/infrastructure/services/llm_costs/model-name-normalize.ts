/**
 * Normalizes LLM model identifiers for pricing lookup.
 * Strips OpenRouter provider prefixes and sanitizes the slug.
 */
export function normalizeModelNameForPricing(modelName: string): string {
  return (modelName || '')
    .toLowerCase()
    .replace(/^(openai|anthropic|google|deepseek|x-ai|meta-llama)\//, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.-]/g, '');
}
