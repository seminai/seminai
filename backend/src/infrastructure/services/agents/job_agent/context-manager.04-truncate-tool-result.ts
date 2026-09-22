import type { ContextManagerContext } from './context-manager.context';

export function contextManagerTruncateToolResult(this: ContextManagerContext, content: string, maxTokens?: number): string {
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
