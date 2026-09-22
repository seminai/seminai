import { Message, MessageRole } from '../../../domain/entities/Message';
import { MessageContext } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerSaveUserMessage(this: AgentChatControllerContext, {
    messageRepository,
    chatId,
    content,
    metadata,
  }: MessageContext): Promise<Message> {
    const sequence = await this.getNextSequence(messageRepository, chatId);
    return messageRepository.create(
      Message.create({
        chatId,
        role: MessageRole.USER,
        content,
        sequence,
        metadata,
      }),
    );
  }
