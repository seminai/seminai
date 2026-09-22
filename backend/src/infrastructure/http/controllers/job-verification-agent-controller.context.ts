import { Request, Response } from 'express';
import { prisma } from '../../repositories/Prisma';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { Chat } from '../../../domain/entities/Chat';
import { Message, AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import { ChatContext, MessageContext, AssistantMessageContext, PendingModificationRecord } from './job-verification-agent-controller.support';

export interface JobVerificationAgentControllerContext {
  stream(req: Request, res: Response): Promise<void>;
  message(req: Request, res: Response): Promise<Response>;
  approve(req: Request, res: Response): Promise<Response>;
  reject(req: Request, res: Response): Promise<Response>;
  getState(req: Request, res: Response): Promise<Response>;
  getOrCreateChat({
    chatRepository,
    userId,
    threadId,
    modelName,
    temperature,
  }: ChatContext): Promise<Chat>;
  saveUserMessage({
    messageRepository,
    chatId,
    content,
    metadata,
  }: MessageContext): Promise<Message>;
  saveAssistantMessage({
    messageRepository,
    chatId,
    content,
    status,
    pendingToolCalls,
    error,
    cost,
    metadata,
  }: AssistantMessageContext): Promise<Message>;
  getNextSequence(messageRepository: PrismaMessageRepository, chatId: string): Promise<number>;
  recoverPendingModificationsFromChat(chatId: string, db: typeof prisma): Promise<PendingModificationRecord[]>;
  mapAgentStatus(status:
      | 'COMPLETED'
      | 'REQUIRES_APPROVAL'
      | 'REQUIRES_MODIFICATION_APPROVAL'
      | 'PROCESSING'
      | 'ERROR'): MessageStatus;
  getDefaultAssistantMessage(status: MessageStatus): string;
  logStreamError({
    threadId,
    eventType,
    error,
  }: {
    threadId: string;
    eventType: string;
    error: unknown;
  }): void;
}
