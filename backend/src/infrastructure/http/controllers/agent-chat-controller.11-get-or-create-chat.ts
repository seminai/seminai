import { AppError } from '../../../domain/errors/AppError';
import { Chat, ChatCategory } from '../../../domain/entities/Chat';
import { ChatContext } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerGetOrCreateChat(this: AgentChatControllerContext, {
    chatRepository,
    userId,
    threadId,
    modelName,
    temperature,
  }: ChatContext): Promise<Chat> {
    const existingChat = await chatRepository.findByThreadId(threadId);
    if (existingChat) {
      if (existingChat.userId !== userId) {
        throw AppError.forbidden('Not authorized for this chat', 'CHAT_FORBIDDEN');
      }
      return existingChat;
    }

    return chatRepository.create(
      Chat.create({
        userId,
        threadId,
        category: ChatCategory.DOSAGE_AGENT,
        modelName,
        temperature,
      }),
    );
  }
