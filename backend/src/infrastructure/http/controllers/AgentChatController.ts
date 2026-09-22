import { Request, Response } from 'express';
import { WorkspaceKind } from '@prisma/client';
import type { AgentResponse } from '../../services/agents/dosage_agent_react/DosageReactAgent';
import type { ChatAgentPort } from '../../services/agents/chat-routing/ChatAgentPort';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import type { StreamEvent } from '../../services/agents/dosage_agent_react/type/events';
import { Chat } from '../../../domain/entities/Chat';
import { Message, AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import { ChatContext, MessageContext, AssistantMessageContext } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';
import { agentChatControllerStream } from './agent-chat-controller.01-stream';
import { agentChatControllerMessage } from './agent-chat-controller.02-message';
import { agentChatControllerApprove } from './agent-chat-controller.03-approve';
import { agentChatControllerReject } from './agent-chat-controller.04-reject';
import { agentChatControllerGetStreamState } from './agent-chat-controller.05-get-stream-state';
import { agentChatControllerGetStreamEvents } from './agent-chat-controller.06-get-stream-events';
import { agentChatControllerCancel } from './agent-chat-controller.07-cancel';
import { agentChatControllerGetState } from './agent-chat-controller.08-get-state';
import { agentChatControllerPersistAgentResponseStreamEvent } from './agent-chat-controller.09-persist-agent-response-stream-event';
import { agentChatControllerBuildStreamEventFromAgentResponse } from './agent-chat-controller.10-build-stream-event-from-agent-response';
import { agentChatControllerGetOrCreateChat } from './agent-chat-controller.11-get-or-create-chat';
import { agentChatControllerGetOwnedChatOrThrow } from './agent-chat-controller.12-get-owned-chat-or-throw';
import { agentChatControllerSaveUserMessage } from './agent-chat-controller.13-save-user-message';
import { agentChatControllerSaveAssistantMessage } from './agent-chat-controller.14-save-assistant-message';
import { agentChatControllerGetNextSequence } from './agent-chat-controller.15-get-next-sequence';
import { agentChatControllerBuildUserMessageMetadata } from './agent-chat-controller.16-build-user-message-metadata';
import { agentChatControllerMapAgentStatus } from './agent-chat-controller.17-map-agent-status';
import { agentChatControllerValidateWorkspaceMembership } from './agent-chat-controller.18-validate-workspace-membership';
import { agentChatControllerResolveAgentForRequest } from './agent-chat-controller.19-resolve-agent-for-request';
import { agentChatControllerLoadWorkspaceKindForMember } from './agent-chat-controller.20-load-workspace-kind-for-member';
import { agentChatControllerGetDefaultAssistantMessage } from './agent-chat-controller.21-get-default-assistant-message';


/**
 * Generic controller for agent chat operations.
 * Currently connected to ChatDosageAgent, but designed to be extensible.
 */
export class AgentChatController {

  /**
   * Stream chat response from the agent.
   * POST /agent-chat/stream
   */
  async stream(req: Request, res: Response): Promise<void> {
    return agentChatControllerStream.call(this as unknown as AgentChatControllerContext, req, res);
  }

  /**
   * Handle non-streaming chat message (for compatibility).
   * POST /agent-chat/message
   */
  async message(req: Request, res: Response): Promise<Response> {
    return agentChatControllerMessage.call(this as unknown as AgentChatControllerContext, req, res);
  }

  /**
   * Approve pending tool execution.
   * POST /agent-chat/approve
   */
  async approve(req: Request, res: Response): Promise<Response> {
    return agentChatControllerApprove.call(this as unknown as AgentChatControllerContext, req, res);
  }

  /**
   * Reject pending tool execution.
   * POST /agent-chat/reject
   */
  async reject(req: Request, res: Response): Promise<Response> {
    return agentChatControllerReject.call(this as unknown as AgentChatControllerContext, req, res);
  }

  /**
   * Return the resumption state of a thread's stream (catch-up support).
   * GET /agent-chat/threads/:threadId/stream-state
   */
  async getStreamState(req: Request, res: Response): Promise<Response> {
    return agentChatControllerGetStreamState.call(this as unknown as AgentChatControllerContext, req, res);
  }

  /**
   * Return persisted stream events for a thread with `seq > since` (catch-up).
   * GET /agent-chat/threads/:threadId/stream-events?since=N&limit=M
   */
  async getStreamEvents(req: Request, res: Response): Promise<Response> {
    return agentChatControllerGetStreamEvents.call(this as unknown as AgentChatControllerContext, req, res);
  }

  /**
   * Cancel an in-flight agent stream for a thread.
   * POST /agent-chat/cancel
   */
  async cancel(req: Request, res: Response): Promise<Response> {
    return agentChatControllerCancel.call(this as unknown as AgentChatControllerContext, req, res);
  }

  /**
   * Get conversation state for a thread.
   * GET /agent-chat/state/:threadId
   */
  async getState(req: Request, res: Response): Promise<Response> {
    return agentChatControllerGetState.call(this as unknown as AgentChatControllerContext, req, res);
  }

  async persistAgentResponseStreamEvent(
    threadId: string,
    response: AgentResponse,
  ): Promise<void> {
    return agentChatControllerPersistAgentResponseStreamEvent.call(this as unknown as AgentChatControllerContext, threadId, response);
  }

  buildStreamEventFromAgentResponse(response: AgentResponse): StreamEvent {
    return agentChatControllerBuildStreamEventFromAgentResponse.call(this as unknown as AgentChatControllerContext, response);
  }

  async getOrCreateChat(context: ChatContext): Promise<Chat> {
    return agentChatControllerGetOrCreateChat.call(
      this as unknown as AgentChatControllerContext,
      context,
    );
  }

  async getOwnedChatOrThrow(context: ChatContext): Promise<Chat> {
    return agentChatControllerGetOwnedChatOrThrow.call(
      this as unknown as AgentChatControllerContext,
      context,
    );
  }

  async saveUserMessage(context: MessageContext): Promise<Message> {
    return agentChatControllerSaveUserMessage.call(
      this as unknown as AgentChatControllerContext,
      context,
    );
  }

  async saveAssistantMessage(context: AssistantMessageContext): Promise<Message> {
    return agentChatControllerSaveAssistantMessage.call(
      this as unknown as AgentChatControllerContext,
      context,
    );
  }

  async getNextSequence(
    messageRepository: PrismaMessageRepository,
    chatId: string,
  ): Promise<number> {
    return agentChatControllerGetNextSequence.call(this as unknown as AgentChatControllerContext, messageRepository, chatId);
  }

  buildUserMessageMetadata(context: {
    readonly jobId?: string;
    readonly attachments: readonly unknown[];
  }): Record<string, unknown> | undefined {
    return agentChatControllerBuildUserMessageMetadata.call(
      this as unknown as AgentChatControllerContext,
      context,
    );
  }

  mapAgentStatus(status: AgentResponse['status']): MessageStatus {
    return agentChatControllerMapAgentStatus.call(this as unknown as AgentChatControllerContext, status);
  }

  async validateWorkspaceMembership(userId: string, workspaceId: string): Promise<void> {
    return agentChatControllerValidateWorkspaceMembership.call(this as unknown as AgentChatControllerContext, userId, workspaceId);
  }

  /**
   * Resolve the chat agent for an incoming stream/message request.
   *
   * Job-scoped chat is always agricultural. With routing disabled (default), the
   * dosage agent is used and `workspaceId` (if present) is membership-validated.
   * With `WORKSPACE_KIND_ROUTING=true`, `workspaceId` is required and the agent
   * is selected from the workspace kind.
   */
  async resolveAgentForRequest(context: {
    readonly userId: string;
    readonly workspaceId?: string;
    readonly jobId?: string;
  }): Promise<ChatAgentPort> {
    return agentChatControllerResolveAgentForRequest.call(
      this as unknown as AgentChatControllerContext,
      context,
    );
  }

  /**
   * Load a workspace kind while asserting the user is a member, in a single query.
   */
  async loadWorkspaceKindForMember(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceKind> {
    return agentChatControllerLoadWorkspaceKindForMember.call(this as unknown as AgentChatControllerContext, userId, workspaceId);
  }

  getDefaultAssistantMessage(status: MessageStatus): string {
    return agentChatControllerGetDefaultAssistantMessage.call(this as unknown as AgentChatControllerContext, status);
  }
}
