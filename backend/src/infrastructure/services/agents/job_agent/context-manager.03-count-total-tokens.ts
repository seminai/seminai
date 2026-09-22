import { BaseMessage } from '@langchain/core/messages';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerCountTotalTokens(this: ContextManagerContext, messages: BaseMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.countMessageTokens(msg), 0);
  }
