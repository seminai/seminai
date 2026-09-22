import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import type { StreamReactAgentOptions } from '../../services/agents/dosage_agent_react/streaming';
import { ReactChatModel } from '../../services/agents/dosage_agent_react/graph/DosageReactGraph';
import { updateWorkingMemory } from '../../services/agents/dosage_agent_react/working-memory';
import type { MulterFile } from '../../services/Multer';
import { type MentionItem } from '../../../domain/dtos/mention.dto';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { PrismaAgentStreamEventRepository } from '../../repositories/PrismaAgentStreamEventRepository';
import { createChatEmitter } from '../../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import type { StreamEvent } from '../../services/agents/dosage_agent_react/type/events';
import { FileService } from '../../services/FileService';
import { buildChatAttachmentMetadata } from './agent-chat-attachment-metadata';
import { persistUserProfileFacts } from '../../services/agents/dosage_agent_react/memory/user-profile-memory';
import { enforceChatModel, MAX_MESSAGE_LENGTH, parseMentionsInput, parseClientContextInput } from './agent-chat-controller.support';
import type { AgentChatControllerContext } from './agent-chat-controller.context';
import { consumeAgentStream } from './agent-chat-stream-consumer';

export async function agentChatControllerStream(this: AgentChatControllerContext, req: Request, res: Response): Promise<void> {
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

      const {
        assistantContent,
        finalAgentResponse,
        finalCost,
        finalStatus,
        finalPendingToolCalls,
        finalError,
        finalMetadata,
      } = await consumeAgentStream({
        iterator: agent.stream(options),
        persistEvent: (event) =>
          persistEvent(event.type, event as unknown as Record<string, unknown>, event),
        writeEvent: writeSseEvent,
        mapStatus: (status) => this.mapAgentStatus(status),
      });

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
          metadata: finalMetadata ? { ...finalMetadata } : undefined,
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
