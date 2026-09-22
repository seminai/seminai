import { ToolMessage } from '@langchain/core/messages';
import type { ContextManagerContext } from './context-manager.context';

export function contextManagerCreateTruncatedToolMessage(this: ContextManagerContext, msg: ToolMessage): ToolMessage {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncatedContent = this.truncateToolResult(content, 500); // Very aggressive for old tool results

    return new ToolMessage({
      content: truncatedContent,
      tool_call_id: msg.tool_call_id,
      name: msg.name,
    });
  }
