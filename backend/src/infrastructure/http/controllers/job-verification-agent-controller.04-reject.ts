import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { createJobVerificationAgentApp, rejectJobVerificationAction } from '../../services/agents/job_agent/ChatJobVerificationAgent';
import { ChatModel } from '../../services/agents/job_agent/graph';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerReject(this: JobVerificationAgentControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId, reason, modelName, temperature } = req.body as {
      threadId?: string;
      reason?: string;
      modelName?: ChatModel;
      temperature?: number;
    };

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    if (!reason || typeof reason !== 'string') {
      throw AppError.badRequest('Reason is required', 'INVALID_REASON');
    }

    const chatRepository = new PrismaChatRepository(prisma);
    const messageRepository = new PrismaMessageRepository(prisma);

    try {
      const chat = await this.getOrCreateChat({
        chatRepository,
        userId: req.user.id,
        threadId,
        modelName,
        temperature,
      });

      await this.saveUserMessage({
        messageRepository,
        chatId: chat.id,
        content: `User rejected the pending action. Reason: ${reason}`,
        metadata: { action: 'REJECT', reason },
      });

      const app = createJobVerificationAgentApp({
        modelName: modelName || 'gpt-4o',
        temperature,
        userId: req.user.id,
      });

      const response = await rejectJobVerificationAction(app, threadId, reason);

      await this.saveAssistantMessage({
        messageRepository,
        chatId: chat.id,
        content:
          response.message || this.getDefaultAssistantMessage(this.mapAgentStatus(response.status)),
        status: this.mapAgentStatus(response.status),
        pendingToolCalls: response.pendingAction
          ? [{ ...response.pendingAction } as Record<string, unknown>]
          : undefined,
        error: response.error,
        metadata: {
          sources: response.sources,
          tasks: response.tasks,
          reasoning: response.reasoning,
        },
      });

      return res.status(200).json({
        status: 'success',
        data: response,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw AppError.internal(`Failed to reject action: ${errorMessage}`, 'AGENT_ERROR');
    }
  }
