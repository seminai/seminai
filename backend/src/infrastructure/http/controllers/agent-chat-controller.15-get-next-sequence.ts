import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerGetNextSequence(this: AgentChatControllerContext, messageRepository: PrismaMessageRepository, chatId: string): Promise<number> {
    const lastMessage = await messageRepository.findLatestByChatId(chatId);
    return lastMessage ? lastMessage.sequence + 1 : 0;
  }
