import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { getAnalyticsService } from '../../services/analytics/analytics-service.singleton';
import { buildAnalyticsContext } from '../analytics-context';
import { resolveChatAgent } from '../../services/agents/chat-routing/resolveChatAgent';
import { DEFAULT_REACT_MODEL, ReactChatModel } from '../../services/agents/dosage_agent_react/graph/DosageReactGraph';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { enforceChatModel } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerApprove(this: AgentChatControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const {
      threadId,
      modelName: requestedModelName,
      temperature,
    } = req.body as {
      threadId?: string;
      modelName?: ReactChatModel;
      temperature?: number;
    };
    const modelName: ReactChatModel = enforceChatModel(requestedModelName);

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    const chatRepository = new PrismaChatRepository(prisma);
    const messageRepository = new PrismaMessageRepository(prisma);

    try {
      console.log(`[AgentChat:approve] threadId=${threadId} userId=${req.user.id}`);

      const chat = await this.getOwnedChatOrThrow({
        chatRepository,
        userId: req.user.id,
        threadId,
        modelName,
        temperature,
      });

      await this.saveUserMessage({
        messageRepository,
        chatId: chat.id,
        content: 'User approved the pending tool execution.',
        metadata: { action: 'APPROVE' },
      });

      // approve/reject/getState act on an existing thread and carry no
      // workspaceId from the client, so they stay on the dosage agent in Phase 3.
      // Phase 4 will derive the kind from the persisted chat row.
      const agent = resolveChatAgent({ workspaceKind: null });

      // Always reuse the existing cached agent so the same MemorySaver checkpointer is used.
      // Creating a fresh agent would create a fresh (empty) MemorySaver, so the thread state
      // (and the "paused at approval_gate" metadata) would be missing → the graph can't resume.
      const app =
        agent.getCachedApp(threadId) ??
        (await agent.createApp({
          threadId,
          modelName: modelName || DEFAULT_REACT_MODEL,
          temperature,
          userId: req.user.id,
          skipRAG: true,
          requireApproval: true,
        }));

      const response = await agent.approve(app, threadId);
      console.log(`[AgentChat:approve] Response status=${response.status} threadId=${threadId}`);

      const approveCtx = buildAnalyticsContext(req);
      getAnalyticsService().capture({
        distinctId: approveCtx.distinctId,
        event: 'approval_confirmed',
        properties: {
          status: response.status,
          has_pending_tool_calls: Boolean(response.pendingToolCalls?.length),
        },
        groups: approveCtx.groups,
      });

      await this.persistAgentResponseStreamEvent(threadId, response);

      await this.saveAssistantMessage({
        messageRepository,
        chatId: chat.id,
        content:
          response.message || this.getDefaultAssistantMessage(this.mapAgentStatus(response.status)),
        status: this.mapAgentStatus(response.status),
        pendingToolCalls: response.pendingToolCalls,
        error: response.error,
        metadata: response.sources ? { sources: response.sources } : undefined,
      });

      return res.status(200).json({
        status: 'success',
        data: response,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AgentChat:approve] Error threadId=${threadId}:`, error);
      throw AppError.internal(`Failed to approve action: ${errorMessage}`, 'AGENT_ERROR');
    }
  }
