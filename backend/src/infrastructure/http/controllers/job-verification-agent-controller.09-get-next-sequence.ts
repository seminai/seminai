import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerGetNextSequence(this: JobVerificationAgentControllerContext, messageRepository: PrismaMessageRepository, chatId: string): Promise<number> {
    const lastMessage = await messageRepository.findLatestByChatId(chatId);
    return lastMessage ? lastMessage.sequence + 1 : 0;
  }
