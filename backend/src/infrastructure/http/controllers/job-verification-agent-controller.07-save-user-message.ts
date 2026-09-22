import { Message, MessageRole } from '../../../domain/entities/Message';
import { MessageContext } from './job-verification-agent-controller.support';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerSaveUserMessage(this: JobVerificationAgentControllerContext, {
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
