import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { resolveChatAgent } from '../../services/agents/chat-routing/resolveChatAgent';
import { DEFAULT_REACT_MODEL, ReactChatModel } from '../../services/agents/dosage_agent_react/graph/DosageReactGraph';
import { getWorkingMemory } from '../../services/agents/dosage_agent_react/working-memory';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { enforceChatModel } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerGetState(this: AgentChatControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId } = req.params;
    const { modelName: requestedModelName, temperature } = req.query as {
      modelName?: ReactChatModel;
      temperature?: string;
    };
    const modelName: ReactChatModel = enforceChatModel(requestedModelName);

    if (!threadId) {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    try {
      await this.getOwnedChatOrThrow({
        chatRepository: new PrismaChatRepository(prisma),
        userId: req.user.id,
        threadId,
        modelName,
        temperature: temperature ? parseFloat(temperature) : undefined,
      });
      const agent = resolveChatAgent({ workspaceKind: null });
      const app = await agent.createApp({
        threadId,
        modelName: (modelName as ReactChatModel) || DEFAULT_REACT_MODEL,
        temperature: temperature ? parseFloat(temperature) : undefined,
        userId: req.user.id,
        skipRAG: true, // No need for RAG on getState
      });

      const state = await agent.getState(app, threadId);

      return res.status(200).json({
        status: 'success',
        data: {
          ...state,
          pendingQuestionnaire: getWorkingMemory(threadId).pendingQuestionnaire,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw AppError.internal(`Failed to get state: ${errorMessage}`, 'AGENT_ERROR');
    }
  }
