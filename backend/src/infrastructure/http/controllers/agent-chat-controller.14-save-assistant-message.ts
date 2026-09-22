import { Message, MessageRole } from '../../../domain/entities/Message';
import { AssistantMessageContext } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerSaveAssistantMessage(this: AgentChatControllerContext, {
    messageRepository,
    chatId,
    content,
    status,
    pendingToolCalls,
    error,
    cost,
    metadata,
  }: AssistantMessageContext): Promise<Message> {
    const sequence = await this.getNextSequence(messageRepository, chatId);
    return messageRepository.create(
      Message.create({
        chatId,
        role: MessageRole.ASSISTANT,
        content,
        status,
        sequence,
        pendingToolCalls,
        error,
        cost,
        metadata,
      }),
    );
  }
