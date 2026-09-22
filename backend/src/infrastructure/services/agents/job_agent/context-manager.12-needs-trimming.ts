import { BaseMessage } from '@langchain/core/messages';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerNeedsTrimming(this: ContextManagerContext, messages: BaseMessage[]): boolean {
    const totalTokens = this.countTotalTokens(messages);
    return totalTokens > this.config.maxContextTokens;
  }
