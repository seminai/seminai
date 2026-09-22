import type { ContextManagerContext } from './context-manager.context';

export function contextManagerTruncateJsonObject(this: ContextManagerContext, obj: unknown, maxTokens: number): string {
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
