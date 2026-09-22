import type { ContextManagerContext } from './context-manager.context';

export function contextManagerTruncateString(this: ContextManagerContext, text: string, maxTokens: number): string {
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
