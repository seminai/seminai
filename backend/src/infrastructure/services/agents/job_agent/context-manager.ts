import { BaseMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

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

const DEFAULT_CONFIG: ContextManagerConfig = {
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
function estimateTokenCount(text: string): number {
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

/**
 * Manages context window to prevent token overflow errors.
 * Provides message trimming, token counting, and tool result truncation.
 */
export class ContextManager {
  private config: ContextManagerConfig;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Counts tokens in a string using heuristic estimation
   */
  countTokens(text: string): number {
    return estimateTokenCount(text);
  }

  /**
   * Counts tokens in a message
   */
  countMessageTokens(message: BaseMessage): number {
    const content =
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    // Add overhead for message structure (role, etc.)
    const overhead = 4;
    return this.countTokens(content) + overhead;
  }

  /**
   * Counts total tokens in messages array
   */
  countTotalTokens(messages: BaseMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.countMessageTokens(msg), 0);
  }

  /**
   * Truncates a tool result to fit within max tokens
   */
  truncateToolResult(content: string, maxTokens?: number): string {
    const limit = maxTokens ?? this.config.maxToolResultTokens;
    const tokens = this.countTokens(content);

    if (tokens <= limit) {
      return content;
    }

    // Try to parse as JSON to truncate intelligently
    try {
      const parsed = JSON.parse(content);
      return this.truncateJsonObject(parsed, limit);
    } catch {
      // Not JSON - truncate string directly
      return this.truncateString(content, limit);
    }
  }

  /**
   * Truncates a JSON object to fit within token limit
   */
  private truncateJsonObject(obj: unknown, maxTokens: number): string {
    // First try: stringify with 2-space indent
    let result = JSON.stringify(obj, null, 2);
    if (this.countTokens(result) <= maxTokens) {
      return result;
    }

    // Second try: stringify without indent
    result = JSON.stringify(obj);
    if (this.countTokens(result) <= maxTokens) {
      return result;
    }

    // Third try: for arrays, limit elements
    if (Array.isArray(obj)) {
      const truncatedArray = this.truncateArray(obj, maxTokens);
      return JSON.stringify(truncatedArray);
    }

    // Fourth try: for objects, remove large nested values
    if (typeof obj === 'object' && obj !== null) {
      const truncatedObj = this.truncateObjectValues(obj as Record<string, unknown>, maxTokens);
      return JSON.stringify(truncatedObj);
    }

    // Fallback: string truncation
    return this.truncateString(result, maxTokens);
  }

  /**
   * Truncates an array to fit within token limit
   */
  private truncateArray(arr: unknown[], maxTokens: number): unknown[] {
    const result: unknown[] = [];
    let currentTokens = 10; // Overhead for [] and commas

    for (const item of arr) {
      const itemStr = JSON.stringify(item);
      const itemTokens = this.countTokens(itemStr);

      if (currentTokens + itemTokens > maxTokens) {
        // Add truncation marker
        result.push({ _truncated: true, _remaining: arr.length - result.length });
        break;
      }

      result.push(item);
      currentTokens += itemTokens;
    }

    return result;
  }

  /**
   * Truncates object values that are too large
   */
  private truncateObjectValues(
    obj: Record<string, unknown>,
    maxTokens: number,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    let currentTokens = 10; // Overhead for {} and commas
    const perKeyLimit = Math.floor(maxTokens / Math.max(Object.keys(obj).length, 1));

    for (const [key, value] of Object.entries(obj)) {
      const valueStr = JSON.stringify(value);
      const valueTokens = this.countTokens(valueStr);

      if (valueTokens > perKeyLimit) {
        // Truncate this value
        if (typeof value === 'string') {
          result[key] = this.truncateString(value, perKeyLimit) + '...[truncated]';
        } else if (Array.isArray(value)) {
          result[key] = this.truncateArray(value, perKeyLimit);
        } else if (typeof value === 'object' && value !== null) {
          result[key] = {
            _truncated: true,
            _originalKeys: Object.keys(value as Record<string, unknown>),
          };
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }

      currentTokens += this.countTokens(JSON.stringify({ [key]: result[key] }));

      if (currentTokens > maxTokens) {
        result._truncated = true;
        break;
      }
    }

    return result;
  }

  /**
   * Truncates a string to fit within token limit
   */
  private truncateString(text: string, maxTokens: number): string {
    const tokens = this.countTokens(text);
    if (tokens <= maxTokens) return text;

    // Binary search for optimal truncation point
    let low = 0;
    let high = text.length;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const substr = text.substring(0, mid);
      if (this.countTokens(substr) <= maxTokens - 20) {
        // Leave room for truncation marker
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return text.substring(0, low) + '...[truncated]';
  }

  /**
   * Trims messages to fit within context window.
   * Preserves system messages and recent messages.
   * Removes or summarizes old tool results first.
   */
  trimMessages(messages: BaseMessage[]): BaseMessage[] {
    const totalTokens = this.countTotalTokens(messages);

    if (totalTokens <= this.config.maxContextTokens) {
      return messages;
    }

    console.log(
      `[CONTEXT_MANAGER] Trimming messages: ${totalTokens} tokens -> target ${this.config.targetTokensAfterTrim}`,
    );

    // Separate messages by type
    const systemMessages = messages.filter((m) => m instanceof SystemMessage);
    const nonSystemMessages = messages.filter((m) => !(m instanceof SystemMessage));

    // Calculate available tokens for non-system messages
    const systemTokens = this.countTotalTokens(systemMessages);
    const availableTokens = this.config.targetTokensAfterTrim - systemTokens;

    // Always keep recent messages
    const recentMessages = nonSystemMessages.slice(-this.config.minRecentMessages);
    const olderMessages = nonSystemMessages.slice(0, -this.config.minRecentMessages);

    const recentTokens = this.countTotalTokens(recentMessages);
    const availableForOlder = availableTokens - recentTokens;

    // Process older messages - truncate tool results and summarize
    const processedOlder: BaseMessage[] = [];
    let olderTokens = 0;

    for (const msg of olderMessages) {
      // Truncate tool messages aggressively
      if (msg instanceof ToolMessage) {
        const truncated = this.createTruncatedToolMessage(msg);
        const truncatedTokens = this.countMessageTokens(truncated);

        if (olderTokens + truncatedTokens <= availableForOlder) {
          processedOlder.push(truncated);
          olderTokens += truncatedTokens;
        }
        // Skip if doesn't fit
        continue;
      }

      // Truncate AI messages with long content
      if (msg instanceof AIMessage) {
        const msgTokens = this.countMessageTokens(msg);
        if (msgTokens > 1000) {
          const truncated = this.truncateAIMessage(msg);
          const truncatedTokens = this.countMessageTokens(truncated);
          if (olderTokens + truncatedTokens <= availableForOlder) {
            processedOlder.push(truncated);
            olderTokens += truncatedTokens;
          }
          continue;
        }
      }

      // Keep other messages if they fit
      const msgTokens = this.countMessageTokens(msg);
      if (olderTokens + msgTokens <= availableForOlder) {
        processedOlder.push(msg);
        olderTokens += msgTokens;
      }
    }

    // Reconstruct message array
    const trimmedMessages = [...systemMessages, ...processedOlder, ...recentMessages];

    const finalTokens = this.countTotalTokens(trimmedMessages);
    console.log(
      `[CONTEXT_MANAGER] Trimmed: ${messages.length} -> ${trimmedMessages.length} messages, ${totalTokens} -> ${finalTokens} tokens`,
    );

    return trimmedMessages;
  }

  /**
   * Creates a truncated version of a tool message
   */
  private createTruncatedToolMessage(msg: ToolMessage): ToolMessage {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncatedContent = this.truncateToolResult(content, 500); // Very aggressive for old tool results

    return new ToolMessage({
      content: truncatedContent,
      tool_call_id: msg.tool_call_id,
      name: msg.name,
    });
  }

  /**
   * Truncates an AI message
   */
  private truncateAIMessage(msg: AIMessage): AIMessage {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncatedContent = this.truncateString(content, 500);

    return new AIMessage({
      content: truncatedContent,
      tool_calls: (msg as AIMessage & { tool_calls?: unknown[] }).tool_calls,
    });
  }

  /**
   * Check if context needs trimming
   */
  needsTrimming(messages: BaseMessage[]): boolean {
    const totalTokens = this.countTotalTokens(messages);
    return totalTokens > this.config.maxContextTokens;
  }

  /**
   * Get current token count
   */
  getTokenCount(messages: BaseMessage[]): number {
    return this.countTotalTokens(messages);
  }
}

/**
 * Creates a message reducer that includes context management
 */
export function createManagedMessageReducer(config?: Partial<ContextManagerConfig>) {
  const contextManager = new ContextManager(config);

  return (existingMessages: BaseMessage[], newMessages: BaseMessage[]): BaseMessage[] => {
    // Concatenate messages
    const allMessages = existingMessages.concat(newMessages);

    // Trim if needed
    if (contextManager.needsTrimming(allMessages)) {
      return contextManager.trimMessages(allMessages);
    }

    return allMessages;
  };
}

/**
 * Singleton instance for shared use
 */
let sharedContextManager: ContextManager | null = null;

export function getSharedContextManager(): ContextManager {
  if (!sharedContextManager) {
    sharedContextManager = new ContextManager();
  }
  return sharedContextManager;
}

/**
 * Truncates a tool result for safe storage
 */
export function truncateToolResult(content: string, maxTokens?: number): string {
  return getSharedContextManager().truncateToolResult(content, maxTokens);
}
