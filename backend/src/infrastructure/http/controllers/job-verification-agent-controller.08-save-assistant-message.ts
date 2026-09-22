import { Message, MessageRole } from '../../../domain/entities/Message';
import { AssistantMessageContext } from './job-verification-agent-controller.support';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerSaveAssistantMessage(this: JobVerificationAgentControllerContext, {
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
