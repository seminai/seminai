import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { JobVerificationInput } from '../../services/agents/job_agent';
import { createJobVerificationAgentApp, handleJobVerificationMessage } from '../../services/agents/job_agent/ChatJobVerificationAgent';
import { ChatModel } from '../../services/agents/job_agent/graph';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { JobWithAssignmentDTO } from '../../../domain/dtos/job-assignment.dto';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerMessage(this: JobVerificationAgentControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId, jobs, message, metadata, modelName, temperature } = req.body as {
      threadId?: string;
      jobs?: JobWithAssignmentDTO[];
      message?: string;
      metadata?: { images?: string[]; links?: string[]; pdfs?: string[] };
      modelName?: ChatModel;
      temperature?: number;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw AppError.badRequest(
        'Message is required and must be a non-empty string',
        'INVALID_MESSAGE',
      );
    }

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      throw AppError.badRequest('Jobs array is required and must not be empty', 'INVALID_JOBS');
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
        content: message,
        metadata: { jobs: jobs.map((j) => j.job.id), ...metadata },
      });

      const app = createJobVerificationAgentApp({
        modelName: modelName || 'gpt-4o',
        temperature,
        userId: req.user.id,
      });

      const input: JobVerificationInput = {
        jobs,
        message,
        metadata,
      };

      const response = await handleJobVerificationMessage(app, threadId, input);

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
      throw AppError.internal(`Failed to process message: ${errorMessage}`, 'AGENT_ERROR');
    }
  }
