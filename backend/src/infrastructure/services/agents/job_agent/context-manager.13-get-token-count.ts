import { BaseMessage } from '@langchain/core/messages';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerGetTokenCount(this: ContextManagerContext, messages: BaseMessage[]): number {
    return this.countTotalTokens(messages);
  }
