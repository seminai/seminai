import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { getAnalyticsService } from '../../services/analytics/analytics-service.singleton';
import { buildAnalyticsContext } from '../analytics-context';
import { WorkspaceKind } from '@prisma/client';
import type { StreamReactAgentOptions } from '../../services/agents/dosage_agent_react/streaming';
import type { AgentResponse } from '../../services/agents/dosage_agent_react/DosageReactAgent';
import { resolveChatAgent } from '../../services/agents/chat-routing/resolveChatAgent';
import type { ChatAgentPort } from '../../services/agents/chat-routing/ChatAgentPort';
import {
  DEFAULT_REACT_MODEL,
  ReactChatModel,
} from '../../services/agents/dosage_agent_react/graph/DosageReactGraph';
import {
  getWorkingMemory,
  updateWorkingMemory,
} from '../../services/agents/dosage_agent_react/working-memory';
import type { MulterFile } from '../../services/Multer';
import { type MentionItem, isMentionEntityType } from '../../../domain/dtos/mention.dto';
import { buildUserMessageContext } from '../../services/agents/dosage_agent_react/user-message-context-builder';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { PrismaAgentStreamEventRepository } from '../../repositories/PrismaAgentStreamEventRepository';
import { agentRunRegistry } from '../../services/agents/AgentRunRegistry';
import { CancelAgentRunUseCase } from '../../../application/use-cases/agent-chat/CancelAgentRunUseCase';
import { GetChatStreamStateUseCase } from '../../../application/use-cases/agent-chat/GetChatStreamStateUseCase';
import { GetChatStreamEventsUseCase } from '../../../application/use-cases/agent-chat/GetChatStreamEventsUseCase';
import { createChatEmitter } from '../../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import type { StreamEvent } from '../../services/agents/dosage_agent_react/type/events';
import { Chat, ChatCategory } from '../../../domain/entities/Chat';
import {
  Message,
  MessageRole,
  AgentResponseStatus as MessageStatus,
  MessageCost,
} from '../../../domain/entities/Message';
import { FileService } from '../../services/FileService';
import { buildChatAttachmentMetadata } from './agent-chat-attachment-metadata';
import { persistUserProfileFacts } from '../../services/agents/dosage_agent_react/memory/user-profile-memory';

type ChatContext = {
  chatRepository: PrismaChatRepository;
  userId: string;
  threadId: string;
  modelName?: ReactChatModel;
  temperature?: number;
};

type MessageContext = {
  messageRepository: PrismaMessageRepository;
  chatId: string;
  content: string;
  metadata?: Record<string, unknown>;
};

type AssistantMessageContext = MessageContext & {
  status: MessageStatus;
  pendingToolCalls?: Array<Record<string, unknown>>;
  error?: string;
  cost?: MessageCost;
};

/**
 * Cost-control override for the ReAct chat model.
 *
 * Why: in production, FE clients pass `modelName: 'gpt-4o'` which makes every
 * chat turn cost 10-16× more than necessary while delivering no measurable
 * quality benefit at the chat-orchestration layer. The expensive sub-agents
 * (search_products, calculate_dosage, flowMatch*) keep their own model.
 */
function enforceChatModel(requested?: ReactChatModel): ReactChatModel {
  const enforced: ReactChatModel = DEFAULT_REACT_MODEL;
  if (requested && requested !== enforced) {
    console.warn(
      `[AgentChat] Ignoring requested modelName="${requested}" — forcing "${enforced}" for cost control`,
    );
  }
  return enforced;
}

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
      clientContext: rawClientContext,
    } = req.body as {
      threadId?: string;
      message?: string;
      modelName?: ReactChatModel;
      temperature?: number;
      jobId?: string;
      workspaceId?: string;
      mentions?: string | MentionItem[];
      clientContext?: string | Record<string, unknown>;
    };

    const modelName: ReactChatModel = enforceChatModel(requestedModelName);

    // Parse mentions: may arrive as JSON string (FormData) or array (JSON body)
    const mentions = parseMentionsInput(rawMentions);
    const clientContext = parseClientContextInput(rawClientContext);

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw AppError.badRequest(
        'Message is required and must be a non-empty string',
        'INVALID_MESSAGE',
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      throw AppError.badRequest(
        `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`,
        'MESSAGE_TOO_LONG',
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

    // Store uploaded file(s) in working memory (for extract_from_file tool)
    const uploadedFiles = (req as Request & { files?: MulterFile[] }).files ?? [];
    const attachmentMetadata =
      uploadedFiles.length > 0
        ? await buildChatAttachmentMetadata({
            files: uploadedFiles,
            userId: req.user.id,
            uploadFile: (file, userId, path, type) =>
              new FileService(userId).uploadFile(file, userId, path, type),
          })
        : [];
    if (uploadedFiles.length > 0 && threadId) {
      const primary = uploadedFiles[0];
      updateWorkingMemory(threadId, {
        uploadedFileBuffer: primary.buffer,
        uploadedFileMimeType: primary.mimetype,
        uploadedFileName: primary.originalname,
        uploadedFiles: uploadedFiles.map((f) => ({
          buffer: f.buffer,
          mimeType: f.mimetype,
          fileName: f.originalname,
        })),
      });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    let clientDisconnected = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
      }
    });

    const chatRepository = new PrismaChatRepository(prisma);
    const messageRepository = new PrismaMessageRepository(prisma);
    const streamEventRepository = new PrismaAgentStreamEventRepository(prisma);

    const rawEmitter = createChatEmitter(threadId);
    let appendChain: Promise<unknown> = Promise.resolve();
    const writeSseEvent = (event: StreamEvent): void => {
      if (clientDisconnected) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      (res as Response & { flush?: () => void }).flush?.();
    };
    const persistEvent = (
      eventType: string,
      eventPayload: Record<string, unknown>,
      rawEvent: StreamEvent,
    ): void => {
      appendChain = appendChain
        .then(async () => {
          const appended = await streamEventRepository.append({
            threadId,
            type: eventType,
            payload: eventPayload,
          });
          rawEmitter?.emitStreamEventRaw(rawEvent, appended.seq);
        })
        .catch((err) => {
          console.error('[AgentChat:stream] Failed to persist stream event:', err);
        });
    };

    try {
      const chat = await this.getOrCreateChat({
        chatRepository,
        userId: req.user.id,
        threadId,
        modelName,
        temperature,
      });

      const chatCreatedEvent: StreamEvent = { type: 'chat_created', chatId: chat.id };
      console.log('[AgentChat:stream] Emitting chat_created', {
        threadId,
        chatId: chat.id,
        clientDisconnected,
      });
      writeSseEvent(chatCreatedEvent);
      persistEvent(
        'chat_created',
        chatCreatedEvent as unknown as Record<string, unknown>,
        chatCreatedEvent,
      );

      await this.saveUserMessage({
        messageRepository,
        chatId: chat.id,
        content: message,
        metadata: this.buildUserMessageMetadata({ jobId, attachments: attachmentMetadata }),
      });
      await persistUserProfileFacts(req.user.id, message).catch((error) => {
        console.warn('[AgentChat] Failed to persist user profile facts:', error);
      });

      const options: StreamReactAgentOptions = {
        threadId,
        userMessage: message,
        userId: req.user.id,
        modelName,
        temperature,
        jobId,
        workspaceId,
        mentions,
        clientContext,
      };

      const streamIterator = agent.stream(options);
      let streamIteratorClosed = false;
      const closeStreamIterator = async (): Promise<void> => {
        if (streamIteratorClosed || typeof streamIterator.return !== 'function') {
          return;
        }
        streamIteratorClosed = true;
        await streamIterator.return({ status: 'CANCELLED' });
      };
      let assistantContent = '';
      let finalAgentResponse: AgentResponse | null = null;
      let finalCost: MessageCost | undefined;
      let finalStatus: MessageStatus | null = null;
      let finalPendingToolCalls: Array<Record<string, unknown>> | undefined;
      let finalError: string | undefined;
      let finalMetadata: Record<string, unknown> | undefined;
      let finalQuestionnaire: unknown;

      while (true) {
        const { value, done } = await streamIterator.next();
        if (done) {
          finalAgentResponse = value ?? null;
          break;
        }

        const event = value;
        persistEvent(event.type, event as unknown as Record<string, unknown>, event);
        writeSseEvent(event);

        if (event.type === 'token') {
          assistantContent += event.content ?? '';
          continue;
        }

        if (event.type === 'tool_call') {
          continue;
        }

        if (event.type === 'cancelled') {
          finalStatus = MessageStatus.CANCELLED;
          await closeStreamIterator();
          break;
        }

        if (event.type === 'requires_approval') {
          finalStatus = MessageStatus.REQUIRES_APPROVAL;
          finalPendingToolCalls =
            event.toolCall && Object.keys(event.toolCall).length > 0
              ? [
                  {
                    name: event.toolCall.name,
                    args: event.toolCall.args,
                    id: event.toolCall.id,
                  },
                ]
              : undefined;
          await closeStreamIterator();
          break;
        }

        if (event.type === 'complete') {
          finalStatus = MessageStatus.COMPLETED;
          if (event.response?.message) {
            assistantContent = event.response.message;
          }
          if (event.cost) {
            finalCost = {
              inputTokens: event.cost.inputTokens,
              outputTokens: event.cost.outputTokens,
              tavilyCalls: event.cost.tavilyCalls,
              totalCostUsd: event.cost.totalCostUsd,
              costWithMarginUsd: event.cost.costWithMarginUsd,
            };
          }
          finalMetadata = event.sources ? { sources: event.sources } : undefined;
          await closeStreamIterator();
          break;
        }

        if (event.type === 'questionnaire_presented') {
          finalQuestionnaire = event.questionnaire;
          finalMetadata = {
            ...(finalMetadata ?? {}),
            questionnaire: event.questionnaire,
          };
          continue;
        }

        if (event.type === 'extraction_review_presented' && event.extractionReview) {
          finalMetadata = {
            ...(finalMetadata ?? {}),
            extractionReviewId: event.extractionReview.reviewId,
          };
          continue;
        }

        if (event.type === 'error') {
          finalStatus = MessageStatus.ERROR;
          finalError = event.error;
          await closeStreamIterator();
          break;
        }
      }

      if (!finalStatus && finalAgentResponse) {
        finalStatus = this.mapAgentStatus(finalAgentResponse.status);
        finalPendingToolCalls = finalAgentResponse.pendingToolCalls;
        finalError = finalAgentResponse.error;
        finalMetadata = finalAgentResponse.sources
          ? { ...(finalMetadata ?? {}), sources: finalAgentResponse.sources }
          : finalMetadata;
        if (finalAgentResponse.questionnaire) {
          finalQuestionnaire = finalAgentResponse.questionnaire;
          finalMetadata = {
            ...(finalMetadata ?? {}),
            questionnaire: finalAgentResponse.questionnaire,
          };
        }
      }

      if (finalStatus) {
        const assistantMessageContent =
          finalAgentResponse?.message ||
          assistantContent ||
          this.getDefaultAssistantMessage(finalStatus);

        await this.saveAssistantMessage({
          messageRepository,
          chatId: chat.id,
          content: assistantMessageContent,
          status: finalStatus,
          pendingToolCalls: finalPendingToolCalls,
          error: finalError,
          cost: finalCost,
          metadata: finalQuestionnaire || finalMetadata ? { ...(finalMetadata ?? {}) } : undefined,
        });
      }

      await appendChain;

      if (!clientDisconnected) {
        res.end();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorEvent: StreamEvent = { type: 'error', error: errorMessage };
      persistEvent('error', errorEvent as unknown as Record<string, unknown>, errorEvent);
      await appendChain;
      if (!clientDisconnected) {
        writeSseEvent({ type: 'error', error: errorMessage });
        res.end();
      }
    }
  }

  /**
   * Handle non-streaming chat message (for compatibility).
   * POST /agent-chat/message
   */
  async message(req: Request, res: Response): Promise<Response> {
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

  /**
   * Approve pending tool execution.
   * POST /agent-chat/approve
   */
  async approve(req: Request, res: Response): Promise<Response> {
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

  /**
   * Reject pending tool execution.
   * POST /agent-chat/reject
   */
  async reject(req: Request, res: Response): Promise<Response> {
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

  /**
   * Return the resumption state of a thread's stream (catch-up support).
   * GET /agent-chat/threads/:threadId/stream-state
   */
  async getStreamState(req: Request, res: Response): Promise<Response> {
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

  /**
   * Return persisted stream events for a thread with `seq > since` (catch-up).
   * GET /agent-chat/threads/:threadId/stream-events?since=N&limit=M
   */
  async getStreamEvents(req: Request, res: Response): Promise<Response> {
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

  /**
   * Cancel an in-flight agent stream for a thread.
   * POST /agent-chat/cancel
   */
  async cancel(req: Request, res: Response): Promise<Response> {
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

  /**
   * Get conversation state for a thread.
   * GET /agent-chat/state/:threadId
   */
  async getState(req: Request, res: Response): Promise<Response> {
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

  private async persistAgentResponseStreamEvent(
    threadId: string,
    response: AgentResponse,
  ): Promise<void> {
    const event = this.buildStreamEventFromAgentResponse(response);
    const streamEventRepository = new PrismaAgentStreamEventRepository(prisma);
    const appended = await streamEventRepository.append({
      threadId,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });
    createChatEmitter(threadId)?.emitStreamEventRaw(event, appended.seq);
  }

  private buildStreamEventFromAgentResponse(response: AgentResponse): StreamEvent {
    if (response.status === 'COMPLETED') {
      return {
        type: 'complete',
        sources: response.sources,
        response: {
          status: response.status,
          message: response.message,
          sources: response.sources,
        },
      };
    }

    if (response.status === 'REQUIRES_APPROVAL') {
      const pending = response.pendingToolCalls?.[0];
      return {
        type: 'requires_approval',
        content: response.message,
        riskLevel: pending?.riskLevel ?? 'medium',
        toolCall: pending
          ? {
              name: pending.name,
              args: pending.args ?? {},
              id: pending.id,
            }
          : undefined,
        response: {
          status: response.status,
          message: response.message,
          pendingToolCalls: response.pendingToolCalls?.map((toolCall) => ({
            name: toolCall.name,
            args: toolCall.args ?? {},
            id: toolCall.id,
          })),
        },
      };
    }

    if (response.status === 'CANCELLED') {
      return {
        type: 'cancelled',
        response: { status: response.status, message: response.message },
      };
    }

    return {
      type: 'error',
      error: response.error ?? response.message ?? "Errore durante l'esecuzione dello strumento.",
      response: {
        status: response.status,
        message: response.message,
        error: response.error,
      },
    };
  }

  private async getOrCreateChat({
    chatRepository,
    userId,
    threadId,
    modelName,
    temperature,
  }: ChatContext): Promise<Chat> {
    const existingChat = await chatRepository.findByThreadId(threadId);
    if (existingChat) {
      if (existingChat.userId !== userId) {
        throw AppError.forbidden('Not authorized for this chat', 'CHAT_FORBIDDEN');
      }
      return existingChat;
    }

    return chatRepository.create(
      Chat.create({
        userId,
        threadId,
        category: ChatCategory.DOSAGE_AGENT,
        modelName,
        temperature,
      }),
    );
  }

  private async getOwnedChatOrThrow({
    chatRepository,
    userId,
    threadId,
  }: ChatContext): Promise<Chat> {
    const existingChat = await chatRepository.findByThreadIdAndUserId(threadId, userId);
    if (existingChat) {
      return existingChat;
    }

    const conflictingChat = await chatRepository.findByThreadId(threadId);
    if (conflictingChat) {
      throw AppError.forbidden('Not authorized for this chat', 'CHAT_FORBIDDEN');
    }

    throw AppError.notFound('Chat not found', 'CHAT_NOT_FOUND');
  }

  private async saveUserMessage({
    messageRepository,
    chatId,
    content,
    metadata,
  }: MessageContext): Promise<Message> {
    const sequence = await this.getNextSequence(messageRepository, chatId);
    return messageRepository.create(
      Message.create({
        chatId,
        role: MessageRole.USER,
        content,
        sequence,
        metadata,
      }),
    );
  }

  private async saveAssistantMessage({
    messageRepository,
    chatId,
    content,
    status,
    pendingToolCalls,
    error,
    cost,
    metadata,
  }: AssistantMessageContext): Promise<Message> {
    const sequence = await this.getNextSequence(messageRepository, chatId);
    return messageRepository.create(
      Message.create({
        chatId,
        role: MessageRole.ASSISTANT,
        content,
        status,
        sequence,
        pendingToolCalls,
        error,
        cost,
        metadata,
      }),
    );
  }

  private async getNextSequence(
    messageRepository: PrismaMessageRepository,
    chatId: string,
  ): Promise<number> {
    const lastMessage = await messageRepository.findLatestByChatId(chatId);
    return lastMessage ? lastMessage.sequence + 1 : 0;
  }

  private buildUserMessageMetadata({
    jobId,
    attachments,
  }: {
    readonly jobId?: string;
    readonly attachments: readonly unknown[];
  }): Record<string, unknown> | undefined {
    if (!jobId && attachments.length === 0) return undefined;
    return {
      ...(jobId ? { jobId } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  }

  private mapAgentStatus(status: AgentResponse['status']): MessageStatus {
    switch (status) {
      case 'COMPLETED':
        return MessageStatus.COMPLETED;
      case 'REQUIRES_APPROVAL':
        return MessageStatus.REQUIRES_APPROVAL;
      case 'CANCELLED':
        return MessageStatus.CANCELLED;
      case 'ERROR':
      default:
        return MessageStatus.ERROR;
    }
  }

  private async validateWorkspaceMembership(userId: string, workspaceId: string): Promise<void> {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true },
    });
    if (!membership) {
      throw AppError.forbidden(
        'User is not a member of the specified workspace',
        'WORKSPACE_ACCESS_DENIED',
      );
    }
  }

  /**
   * Resolve the chat agent for an incoming stream/message request.
   *
   * Job-scoped chat is always agricultural. With routing disabled (default), the
   * dosage agent is used and `workspaceId` (if present) is membership-validated.
   * With `WORKSPACE_KIND_ROUTING=true`, `workspaceId` is required and the agent
   * is selected from the workspace kind.
   */
  private async resolveAgentForRequest({
    userId,
    workspaceId,
    jobId,
  }: {
    readonly userId: string;
    readonly workspaceId?: string;
    readonly jobId?: string;
  }): Promise<ChatAgentPort> {
    if (jobId) {
      return resolveChatAgent({ workspaceKind: WorkspaceKind.AGRICULTURAL });
    }

    if (process.env.WORKSPACE_KIND_ROUTING !== 'true') {
      if (workspaceId) {
        await this.validateWorkspaceMembership(userId, workspaceId);
      }
      return resolveChatAgent({ workspaceKind: null });
    }

    if (!workspaceId) {
      throw AppError.badRequest('workspaceId is required', 'WORKSPACE_ID_REQUIRED');
    }
    const workspaceKind = await this.loadWorkspaceKindForMember(userId, workspaceId);
    return resolveChatAgent({ workspaceKind });
  }

  /**
   * Load a workspace kind while asserting the user is a member, in a single query.
   */
  private async loadWorkspaceKindForMember(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceKind> {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { workspace: { select: { kind: true } } },
    });
    if (!membership) {
      throw AppError.forbidden(
        'User is not a member of the specified workspace',
        'WORKSPACE_ACCESS_DENIED',
      );
    }
    return membership.workspace.kind;
  }

  private getDefaultAssistantMessage(status: MessageStatus): string {
    if (status === MessageStatus.REQUIRES_APPROVAL) {
      return 'The agent is awaiting approval to execute a tool.';
    }

    if (status === MessageStatus.ERROR) {
      return 'The agent encountered an error while processing the request.';
    }

    if (status === MessageStatus.CANCELLED) {
      return "Risposta annullata dall'utente.";
    }

    return 'No response generated.';
  }
}

/**
 * Parse mentions input which may arrive as a JSON string (from FormData) or as an array (from JSON body).
 */
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_MENTION_ID_LENGTH = 100;
const MAX_MENTION_LABEL_LENGTH = 200;

function sanitizeMentionLabel(label: string): string {
  return label
    .replace(/[<>{}]/g, '')
    .trim()
    .slice(0, MAX_MENTION_LABEL_LENGTH);
}

function validateMentionItem(item: unknown): item is MentionItem {
  if (!item || typeof item !== 'object') return false;
  const m = item as Record<string, unknown>;
  return (
    typeof m.type === 'string' &&
    isMentionEntityType(m.type) &&
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    m.id.length <= MAX_MENTION_ID_LENGTH &&
    typeof m.label === 'string'
  );
}

/**
 * Parse and validate mentions input which may arrive as a JSON string (from FormData) or as an array (from JSON body).
 */
function parseMentionsInput(raw: string | MentionItem[] | undefined): MentionItem[] | undefined {
  if (!raw) return undefined;

  const items: unknown[] = Array.isArray(raw)
    ? raw
    : (() => {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

  const validated = items.filter(validateMentionItem).map((m) => ({
    type: m.type,
    id: m.id.trim(),
    label: sanitizeMentionLabel(m.label),
  }));

  return validated.length > 0 ? validated : undefined;
}

/**
 * Parse the clientContext field from the request body.
 * In FormData requests it arrives as a JSON-stringified payload; in JSON
 * requests it is already an object. Returns undefined for missing or
 * non-object values so downstream code can safely ignore it.
 */
function parseClientContextInput(
  raw: string | Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object') {
    return Object.keys(raw).length > 0 ? raw : undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    return Object.keys(record).length > 0 ? record : undefined;
  } catch {
    return undefined;
  }
}
