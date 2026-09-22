import type { ContextManagerContext } from './context-manager.context';

export function contextManagerTruncateObjectValues(this: ContextManagerContext, obj: Record<string, unknown>, maxTokens: number): Record<string, unknown> {
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
