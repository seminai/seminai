import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaAgentStreamEventRepository } from '../../repositories/PrismaAgentStreamEventRepository';
import { GetChatStreamEventsUseCase } from '../../../application/use-cases/agent-chat/GetChatStreamEventsUseCase';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerGetStreamEvents(this: AgentChatControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { threadId } = req.params;
    if (!threadId) {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }
    const sinceRaw = req.query.since;
    const limitRaw = req.query.limit;
    const sinceSeq = typeof sinceRaw === 'string' ? parseInt(sinceRaw, 10) : 0;
    const limit = typeof limitRaw === 'string' ? parseInt(limitRaw, 10) : undefined;
    if (Number.isNaN(sinceSeq) || sinceSeq < 0) {
      throw AppError.badRequest('Invalid since parameter', 'INVALID_SINCE');
    }
    if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
      throw AppError.badRequest('Invalid limit parameter', 'INVALID_LIMIT');
    }
    const chatRepository = new PrismaChatRepository(prisma);
    const streamEventRepository = new PrismaAgentStreamEventRepository(prisma);
    const useCase = new GetChatStreamEventsUseCase(chatRepository, streamEventRepository);
    const result = await useCase.execute({ threadId, userId: req.user.id, sinceSeq, limit });
    return res.status(200).json({ status: 'success', data: result });
  }
