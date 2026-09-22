/**
 * Configuration for context management
 */
export interface ContextManagerConfig {
  /**
   * Maximum tokens allowed for the context (leave headroom for response)
   * Default: 100000 (for 128K models, leaving 28K for response)
   */
  maxContextTokens: number;

  /**
   * Target tokens after trimming (to avoid immediate re-trimming)
   * Default: 80000
   */
  targetTokensAfterTrim: number;

  /**
   * Maximum tokens per tool result (results are truncated if larger)
   * Default: 4000
   */
  maxToolResultTokens: number;

  /**
   * Whether to keep all system messages (recommended: true)
   * Default: true
   */
  preserveSystemMessages: boolean;

  /**
   * Minimum number of recent messages to always keep
   * Default: 10
   */
  minRecentMessages: number;
}


export const DEFAULT_CONFIG: ContextManagerConfig = {
  maxContextTokens: 100000,
  targetTokensAfterTrim: 80000,
  maxToolResultTokens: 4000,
  preserveSystemMessages: true,
  minRecentMessages: 10,
};


/**
 * Estimates token count from text.
 * Uses heuristics based on GPT-4 tokenization patterns:
 * - Average ~4 characters per token for English text
 * - Slightly higher for JSON/code due to special characters
 * This is an approximation that's sufficient for context management.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  // For JSON-heavy content (common in tool results), use ~3.5 chars/token
  // For regular text, use ~4 chars/token
  const isJson = text.startsWith('{') || text.startsWith('[');
  const charsPerToken = isJson ? 3.5 : 4;

  // Count special patterns that typically use more tokens
  const newlines = (text.match(/\n/g) || []).length;
  const specialChars = (text.match(/[{}\[\]"':,]/g) || []).length;

  // Base token count
  const baseTokens = Math.ceil(text.length / charsPerToken);

  // Add overhead for special characters
  const overhead = Math.ceil((newlines + specialChars * 0.5) / 4);

  return baseTokens + overhead;
}
