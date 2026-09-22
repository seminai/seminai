import { estimateTokenCount } from './context-manager.support';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerCountTokens(this: ContextManagerContext, text: string): number {
    return estimateTokenCount(text);
  }
