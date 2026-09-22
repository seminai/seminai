import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaAgentStreamEventRepository } from '../../repositories/PrismaAgentStreamEventRepository';
import { GetChatStreamStateUseCase } from '../../../application/use-cases/agent-chat/GetChatStreamStateUseCase';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerGetStreamState(this: AgentChatControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { threadId } = req.params;
    if (!threadId) {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }
    const chatRepository = new PrismaChatRepository(prisma);
    const streamEventRepository = new PrismaAgentStreamEventRepository(prisma);
    const useCase = new GetChatStreamStateUseCase(chatRepository, streamEventRepository);
    const result = await useCase.execute({ threadId, userId: req.user.id });
    return res.status(200).json({ status: 'success', data: result });
  }
