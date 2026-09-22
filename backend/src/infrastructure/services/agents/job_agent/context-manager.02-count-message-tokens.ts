import { BaseMessage } from '@langchain/core/messages';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerCountMessageTokens(this: ContextManagerContext, message: BaseMessage): number {
    const content =
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    // Add overhead for message structure (role, etc.)
    const overhead = 4;
    return this.countTokens(content) + overhead;
  }
