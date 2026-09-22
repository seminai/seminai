import { AIMessage } from '@langchain/core/messages';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerTruncateAIMessage(this: ContextManagerContext, msg: AIMessage): AIMessage {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncatedContent = this.truncateString(content, 500);

    return new AIMessage({
      content: truncatedContent,
      tool_calls: (msg as AIMessage & { tool_calls?: unknown[] }).tool_calls,
    });
  }
