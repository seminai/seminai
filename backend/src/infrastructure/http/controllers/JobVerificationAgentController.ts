import { Request, Response } from 'express';
import { prisma } from '../../repositories/Prisma';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { Chat } from '../../../domain/entities/Chat';
import { Message, AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import { ChatContext, MessageContext, AssistantMessageContext, PendingModificationRecord } from './job-verification-agent-controller.support';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';
import { jobVerificationAgentControllerStream } from './job-verification-agent-controller.01-stream';
import { jobVerificationAgentControllerMessage } from './job-verification-agent-controller.02-message';
import { jobVerificationAgentControllerApprove } from './job-verification-agent-controller.03-approve';
import { jobVerificationAgentControllerReject } from './job-verification-agent-controller.04-reject';
import { jobVerificationAgentControllerGetState } from './job-verification-agent-controller.05-get-state';
import { jobVerificationAgentControllerGetOrCreateChat } from './job-verification-agent-controller.06-get-or-create-chat';
import { jobVerificationAgentControllerSaveUserMessage } from './job-verification-agent-controller.07-save-user-message';
import { jobVerificationAgentControllerSaveAssistantMessage } from './job-verification-agent-controller.08-save-assistant-message';
import { jobVerificationAgentControllerGetNextSequence } from './job-verification-agent-controller.09-get-next-sequence';
import { jobVerificationAgentControllerRecoverPendingModificationsFromChat } from './job-verification-agent-controller.10-recover-pending-modifications-from-chat';
import { jobVerificationAgentControllerMapAgentStatus } from './job-verification-agent-controller.11-map-agent-status';
import { jobVerificationAgentControllerGetDefaultAssistantMessage } from './job-verification-agent-controller.12-get-default-assistant-message';
import { jobVerificationAgentControllerLogStreamError } from './job-verification-agent-controller.13-log-stream-error';


/**
 * Controller for job verification agent chat operations.
 */
export class JobVerificationAgentController {

  /**
   * Stream chat response from the job verification agent.
   * POST /job-verification-agent/stream
   */
  async stream(req: Request, res: Response): Promise<void> {
    return jobVerificationAgentControllerStream.call(this as unknown as JobVerificationAgentControllerContext, req, res);
  }

  /**
   * Handle non-streaming chat message.
   * POST /job-verification-agent/message
   */
  async message(req: Request, res: Response): Promise<Response> {
    return jobVerificationAgentControllerMessage.call(this as unknown as JobVerificationAgentControllerContext, req, res);
  }

  /**
   * Approve pending tool execution or modification.
   * POST /job-verification-agent/approve
   */
  async approve(req: Request, res: Response): Promise<Response> {
    return jobVerificationAgentControllerApprove.call(this as unknown as JobVerificationAgentControllerContext, req, res);
  }

  /**
   * Reject pending tool execution or modification.
   * POST /job-verification-agent/reject
   */
  async reject(req: Request, res: Response): Promise<Response> {
    return jobVerificationAgentControllerReject.call(this as unknown as JobVerificationAgentControllerContext, req, res);
  }

  /**
   * Get conversation state for a thread.
   * GET /job-verification-agent/state/:threadId
   */
  async getState(req: Request, res: Response): Promise<Response> {
    return jobVerificationAgentControllerGetState.call(this as unknown as JobVerificationAgentControllerContext, req, res);
  }

  async getOrCreateChat(context: ChatContext): Promise<Chat> {
    return jobVerificationAgentControllerGetOrCreateChat.call(
      this as unknown as JobVerificationAgentControllerContext,
      context,
    );
  }

  async saveUserMessage(context: MessageContext): Promise<Message> {
    return jobVerificationAgentControllerSaveUserMessage.call(
      this as unknown as JobVerificationAgentControllerContext,
      context,
    );
  }

  async saveAssistantMessage(context: AssistantMessageContext): Promise<Message> {
    return jobVerificationAgentControllerSaveAssistantMessage.call(
      this as unknown as JobVerificationAgentControllerContext,
      context,
    );
  }

  async getNextSequence(
    messageRepository: PrismaMessageRepository,
    chatId: string,
  ): Promise<number> {
    return jobVerificationAgentControllerGetNextSequence.call(this as unknown as JobVerificationAgentControllerContext, messageRepository, chatId);
  }

  /**
   * Reads the last REQUIRES_APPROVAL message in a chat and extracts
   * the pending job modifications from its pendingToolCalls metadata.
   * Used to recover modifications when the frontend sends only threadId on approve.
   */
  async recoverPendingModificationsFromChat(
    chatId: string,
    db: typeof prisma,
  ): Promise<PendingModificationRecord[]> {
    return jobVerificationAgentControllerRecoverPendingModificationsFromChat.call(this as unknown as JobVerificationAgentControllerContext, chatId, db);
  }

  mapAgentStatus(
    status:
      | 'COMPLETED'
      | 'REQUIRES_APPROVAL'
      | 'REQUIRES_MODIFICATION_APPROVAL'
      | 'PROCESSING'
      | 'ERROR',
  ): MessageStatus {
    return jobVerificationAgentControllerMapAgentStatus.call(this as unknown as JobVerificationAgentControllerContext, status);
  }

  getDefaultAssistantMessage(status: MessageStatus): string {
    return jobVerificationAgentControllerGetDefaultAssistantMessage.call(this as unknown as JobVerificationAgentControllerContext, status);
  }

  logStreamError(context: {
    threadId: string;
    eventType: string;
    error: unknown;
  }): void {
    jobVerificationAgentControllerLogStreamError.call(
      this as unknown as JobVerificationAgentControllerContext,
      context,
    );
  }
}
