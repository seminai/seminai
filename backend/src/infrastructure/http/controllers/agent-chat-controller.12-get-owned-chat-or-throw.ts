import { AppError } from '../../../domain/errors/AppError';
import { Chat } from '../../../domain/entities/Chat';
import { ChatContext } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerGetOwnedChatOrThrow(this: AgentChatControllerContext, {
    chatRepository,
    userId,
    threadId,
  }: ChatContext): Promise<Chat> {
    const existingChat = await chatRepository.findByThreadIdAndUserId(threadId, userId);
    if (existingChat) {
      return existingChat;
    }

    const conflictingChat = await chatRepository.findByThreadId(threadId);
    if (conflictingChat) {
      throw AppError.forbidden('Not authorized for this chat', 'CHAT_FORBIDDEN');
    }

    throw AppError.notFound('Chat not found', 'CHAT_NOT_FOUND');
  }
