import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { agentRunRegistry } from '../../services/agents/AgentRunRegistry';
import { CancelAgentRunUseCase } from '../../../application/use-cases/agent-chat/CancelAgentRunUseCase';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerCancel(this: AgentChatControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId } = req.body as { threadId?: string };
    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    const chatRepository = new PrismaChatRepository(prisma);
    const useCase = new CancelAgentRunUseCase(chatRepository, agentRunRegistry);
    const result = await useCase.execute({ threadId, userId: req.user.id });
    return res.status(200).json({ status: 'success', data: result });
  }
