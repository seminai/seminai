import { Request, Response } from 'express';
import { WorkspaceKind } from '@prisma/client';
import type { AgentResponse } from '../../services/agents/dosage_agent_react/DosageReactAgent';
import type { ChatAgentPort } from '../../services/agents/chat-routing/ChatAgentPort';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import type { StreamEvent } from '../../services/agents/dosage_agent_react/type/events';
import { Chat } from '../../../domain/entities/Chat';
import { Message, AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import { ChatContext, MessageContext, AssistantMessageContext } from './agent-chat-controller.support';

export interface AgentChatControllerContext {
  stream(req: Request, res: Response): Promise<void>;
  message(req: Request, res: Response): Promise<Response>;
  approve(req: Request, res: Response): Promise<Response>;
  reject(req: Request, res: Response): Promise<Response>;
  getStreamState(req: Request, res: Response): Promise<Response>;
  getStreamEvents(req: Request, res: Response): Promise<Response>;
  cancel(req: Request, res: Response): Promise<Response>;
  getState(req: Request, res: Response): Promise<Response>;
  persistAgentResponseStreamEvent(threadId: string, response: AgentResponse): Promise<void>;
  buildStreamEventFromAgentResponse(response: AgentResponse): StreamEvent;
  getOrCreateChat({
    chatRepository,
    userId,
    threadId,
    modelName,
    temperature,
  }: ChatContext): Promise<Chat>;
  getOwnedChatOrThrow({
    chatRepository,
    userId,
    threadId,
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
  buildUserMessageMetadata({
    jobId,
    attachments,
  }: {
    readonly jobId?: string;
    readonly attachments: readonly unknown[];
  }): Record<string, unknown> | undefined;
  mapAgentStatus(status: AgentResponse['status']): MessageStatus;
  validateWorkspaceMembership(userId: string, workspaceId: string): Promise<void>;
  resolveAgentForRequest({
    userId,
    workspaceId,
    jobId,
  }: {
    readonly userId: string;
    readonly workspaceId?: string;
    readonly jobId?: string;
  }): Promise<ChatAgentPort>;
  loadWorkspaceKindForMember(userId: string, workspaceId: string): Promise<WorkspaceKind>;
  getDefaultAssistantMessage(status: MessageStatus): string;
}
