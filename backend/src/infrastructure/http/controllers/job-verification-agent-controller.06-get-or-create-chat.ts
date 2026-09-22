import { Chat, ChatCategory } from '../../../domain/entities/Chat';
import { ChatContext } from './job-verification-agent-controller.support';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerGetOrCreateChat(this: JobVerificationAgentControllerContext, {
    chatRepository,
    userId,
    threadId,
    modelName,
    temperature,
  }: ChatContext): Promise<Chat> {
    const existingChat = await chatRepository.findByThreadId(threadId);
    if (existingChat) {
      return existingChat;
    }

    return chatRepository.create(
      Chat.create({
        userId,
        threadId,
        category: ChatCategory.JOB_VERIFICATION_AGENT,
        modelName,
        temperature,
      }),
    );
  }
