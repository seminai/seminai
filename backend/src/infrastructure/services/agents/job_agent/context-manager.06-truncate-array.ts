import type { ContextManagerContext } from './context-manager.context';

export function contextManagerTruncateArray(this: ContextManagerContext, arr: unknown[], maxTokens: number): unknown[] {
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
