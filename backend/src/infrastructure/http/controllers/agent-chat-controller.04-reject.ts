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

export async function agentChatControllerReject(this: AgentChatControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const {
      threadId,
      reason,
      modelName: requestedModelName,
      temperature,
    } = req.body as {
      threadId?: string;
      reason?: string;
      modelName?: ReactChatModel;
      temperature?: number;
    };
    const modelName: ReactChatModel = enforceChatModel(requestedModelName);

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    if (reason != null && typeof reason !== 'string') {
      throw AppError.badRequest('Reason must be a string', 'INVALID_REASON');
    }

    const chatRepository = new PrismaChatRepository(prisma);
    const messageRepository = new PrismaMessageRepository(prisma);

    try {
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
        content: `User rejected the pending tool execution. Reason: ${reason ?? 'No reason provided'}`,
        metadata: { action: 'REJECT', reason: reason ?? null },
      });

      // Same rationale as approve: dosage agent + reuse the cached app (Phase 3).
      const agent = resolveChatAgent({ workspaceKind: null });
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

      const response = await agent.reject(app, threadId, reason ?? 'No reason provided');

      const rejectCtx = buildAnalyticsContext(req);
      getAnalyticsService().capture({
        distinctId: rejectCtx.distinctId,
        event: 'approval_rejected',
        properties: {
          status: response.status,
          has_reason: Boolean(reason && reason.trim()),
        },
        groups: rejectCtx.groups,
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
      throw AppError.internal(`Failed to reject action: ${errorMessage}`, 'AGENT_ERROR');
    }
  }
