import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { DEFAULT_REACT_MODEL, ReactChatModel } from '../../services/agents/dosage_agent_react/graph/DosageReactGraph';
import { type MentionItem } from '../../../domain/dtos/mention.dto';
import { buildUserMessageContext } from '../../services/agents/dosage_agent_react/user-message-context-builder';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { persistUserProfileFacts } from '../../services/agents/dosage_agent_react/memory/user-profile-memory';
import { enforceChatModel, parseMentionsInput } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';

export async function agentChatControllerMessage(this: AgentChatControllerContext, req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const {
      threadId,
      message,
      modelName: requestedModelName,
      temperature,
      jobId,
      workspaceId,
      mentions: rawMentions,
    } = req.body as {
      threadId?: string;
      message?: string;
      modelName?: ReactChatModel;
      temperature?: number;
      jobId?: string;
      workspaceId?: string;
      mentions?: string | MentionItem[];
    };

    const modelName: ReactChatModel = enforceChatModel(requestedModelName);
    const mentions = parseMentionsInput(rawMentions);

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw AppError.badRequest(
        'Message is required and must be a non-empty string',
        'INVALID_MESSAGE',
      );
    }

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    const agent = await this.resolveAgentForRequest({
      userId: req.user.id,
      workspaceId,
      jobId,
    });

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
        metadata: jobId ? { jobId } : undefined,
      });
      await persistUserProfileFacts(req.user.id, message).catch((error) => {
        console.warn('[AgentChat] Failed to persist user profile facts:', error);
      });

      const app = await agent.createApp({
        threadId,
        modelName: modelName || DEFAULT_REACT_MODEL,
        temperature,
        userId: req.user.id,
        jobId,
        workspaceId,
      });

      const { enrichedMessage } = await buildUserMessageContext({
        threadId,
        userMessage: message,
        userId: req.user.id,
        mentions,
        includeWorkingMemoryContext: true,
      });

      const response = await agent.handleUserMessage(app, threadId, enrichedMessage);

      await this.saveAssistantMessage({
        messageRepository,
        chatId: chat.id,
        content:
          response.message || this.getDefaultAssistantMessage(this.mapAgentStatus(response.status)),
        status: this.mapAgentStatus(response.status),
        pendingToolCalls: response.pendingToolCalls,
        error: response.error,
        metadata:
          response.sources || response.questionnaire
            ? {
                ...(response.sources ? { sources: response.sources } : {}),
                ...(response.questionnaire ? { questionnaire: response.questionnaire } : {}),
              }
            : undefined,
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
      throw AppError.internal(`Failed to process message: ${errorMessage}`, 'AGENT_ERROR');
    }
  }
