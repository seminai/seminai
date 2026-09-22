import { Request, Response } from 'express';
import { MessageRole, AgentResponseStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import {
  streamFieldNoteAgentChat,
  StreamFieldNoteAgentOptions,
} from '../../services/agents/field_note_agent/streaming';
import {
  handleUserMessage,
  approveAndExecute,
  rejectAndRespond,
  getConversationState,
  getFieldNoteAgentRegistry,
} from '../../services/agents/field_note_agent';
import { ChatModel } from '../../services/agents/field_note_agent/graph';
import { AgentResponse } from '../../services/agents/field_note_agent';
import { FileService } from '../../services/FileService';
import { MulterFile } from '../../services/Multer';
import { extractMarkdownWithMistralOCRFromUrl } from '../../services/ocr/mistral';

/**
 * Controller for field note agent operations.
 * Handles streaming chat, approvals, and state management.
 */
export class FieldNoteAgentController {
  private static readonly AGENT_UPLOAD_PATH = 'field-note/agent';

  /**
   * Stream chat response from the field note agent.
   * POST /field-note-agent/stream
   */
  async stream(req: Request, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId, message, modelName, temperature } = req.body as {
      threadId?: string;
      message?: string;
      modelName?: ChatModel;
      temperature?: number | string;
    };

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    const userMessage = await this.buildAgentMessage(req, message);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
      const options: StreamFieldNoteAgentOptions = {
        threadId,
        userMessage,
        userId: req.user.id,
        prisma,
        modelName,
        temperature: this.parseTemperature(temperature),
      };

      const streamIterator = streamFieldNoteAgentChat(options);

      while (true) {
        const { value, done } = await streamIterator.next();
        if (done) {
          break;
        }

        const event = value;
        res.write(`data: ${JSON.stringify(event)}\n\n`);

        if (event.type === 'requires_approval') {
          break;
        }

        if (event.type === 'complete') {
          break;
        }

        if (event.type === 'error') {
          break;
        }
      }

      res.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
      res.end();
    }
  }

  /**
   * Handle non-streaming chat message.
   * POST /field-note-agent/message
   */
  async message(req: Request, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId, message, modelName, temperature } = req.body as {
      threadId?: string;
      message?: string;
      modelName?: ChatModel;
      temperature?: number | string;
    };

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    const userMessage = await this.buildAgentMessage(req, message);

    console.log(
      `[FIELD-NOTE-AGENT] Processing message for thread ${threadId}, user ${req.user.id}`,
    );
    console.log(`[FIELD-NOTE-AGENT] Message: "${userMessage}"`);

    try {
      // Use registry to get or create agent app (with conversation history)
      const registry = getFieldNoteAgentRegistry();
      const { app, chatId } = await registry.getOrCreateApp({
        threadId,
        userId: req.user.id,
        prisma,
        modelName: modelName || 'gpt-4o',
        temperature: this.parseTemperature(temperature),
      });

      // Save user message to Prisma
      await registry.saveMessage(prisma, chatId, MessageRole.USER, userMessage);

      console.log('[FIELD-NOTE-AGENT] App retrieved from registry, handling user message...');

      // Add timeout to prevent hanging (3 minutes for LLM + DB operations)
      let timeoutId: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<AgentResponse>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Agent timeout after 180 seconds')), 180000);
      });

      try {
        const response = await Promise.race([
          handleUserMessage(app, threadId, userMessage),
          timeoutPromise,
        ]);

        // Clear timeout since we got a response
        if (timeoutId) clearTimeout(timeoutId);

        console.log(`[FIELD-NOTE-AGENT] Response status: ${response.status}`);
        console.log(
          `[FIELD-NOTE-AGENT] Response message preview: ${response.message?.substring(0, 100)}...`,
        );
        console.log(
          `[FIELD-NOTE-AGENT] Pending tool calls: ${response.pendingToolCalls?.length || 0}`,
        );

        // Save assistant message to Prisma
        const agentStatus =
          response.status === 'REQUIRES_APPROVAL'
            ? AgentResponseStatus.REQUIRES_APPROVAL
            : response.status === 'ERROR'
              ? AgentResponseStatus.ERROR
              : AgentResponseStatus.COMPLETED;

        await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, response.message || '', {
          status: agentStatus,
          pendingToolCalls: response.pendingToolCalls,
          error: response.error,
        });

        const responsePayload = {
          status: 'success',
          data: response,
        };

        console.log('[FIELD-NOTE-AGENT] Sending response to client...');
        console.log('[FIELD-NOTE-AGENT] Headers sent before:', res.headersSent);

        // Explicitly set content type and send
        res.setHeader('Content-Type', 'application/json');
        const jsonString = JSON.stringify(responsePayload);
        console.log('[FIELD-NOTE-AGENT] Response size:', jsonString.length, 'bytes');

        res.status(200).send(jsonString);
        console.log('[FIELD-NOTE-AGENT] Headers sent after:', res.headersSent);
        console.log('[FIELD-NOTE-AGENT] ✅ Response sent!');
        return;
      } catch (innerError) {
        if (timeoutId) clearTimeout(timeoutId);
        throw innerError;
      }
    } catch (error) {
      console.error('[FIELD-NOTE-AGENT] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw AppError.internal(`Failed to process message: ${errorMessage}`, 'AGENT_ERROR');
    }
  }

  /**
   * Approve pending tool execution.
   * POST /field-note-agent/approve
   */
  async approve(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId, modelName, temperature } = req.body as {
      threadId?: string;
      modelName?: ChatModel;
      temperature?: number;
    };

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    try {
      // Use registry to get agent app (must exist from previous message)
      const registry = getFieldNoteAgentRegistry();
      const { app, chatId } = await registry.getOrCreateApp({
        threadId,
        userId: req.user.id,
        prisma,
        modelName: modelName || 'gpt-4o',
        temperature,
      });

      // Save approval action as user message
      await registry.saveMessage(prisma, chatId, MessageRole.USER, '[APPROVED]', {
        metadata: { action: 'approve' },
      });

      const response = await approveAndExecute(app, threadId, prisma, req.user.id);

      // Save response
      const agentStatus =
        response.status === 'REQUIRES_APPROVAL'
          ? AgentResponseStatus.REQUIRES_APPROVAL
          : response.status === 'ERROR'
            ? AgentResponseStatus.ERROR
            : AgentResponseStatus.COMPLETED;

      await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, response.message || '', {
        status: agentStatus,
        pendingToolCalls: response.pendingToolCalls,
        error: response.error,
      });

      return res.status(200).json({
        status: 'success',
        data: response,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw AppError.internal(`Failed to approve action: ${errorMessage}`, 'AGENT_ERROR');
    }
  }

  /**
   * Reject pending tool execution.
   * POST /field-note-agent/reject
   */
  async reject(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId, feedback, modelName, temperature } = req.body as {
      threadId?: string;
      feedback?: string;
      modelName?: ChatModel;
      temperature?: number;
    };

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    if (!feedback || typeof feedback !== 'string') {
      throw AppError.badRequest('Feedback is required', 'INVALID_FEEDBACK');
    }

    try {
      // Use registry to get agent app (must exist from previous message)
      const registry = getFieldNoteAgentRegistry();
      const { app, chatId } = await registry.getOrCreateApp({
        threadId,
        userId: req.user.id,
        prisma,
        modelName: modelName || 'gpt-4o',
        temperature,
      });

      // Save rejection feedback as user message
      await registry.saveMessage(prisma, chatId, MessageRole.USER, feedback, {
        metadata: { action: 'reject' },
      });

      const response = await rejectAndRespond(app, threadId, feedback);

      // Save response
      const agentStatus =
        response.status === 'REQUIRES_APPROVAL'
          ? AgentResponseStatus.REQUIRES_APPROVAL
          : response.status === 'ERROR'
            ? AgentResponseStatus.ERROR
            : AgentResponseStatus.COMPLETED;

      await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, response.message || '', {
        status: agentStatus,
        pendingToolCalls: response.pendingToolCalls,
        error: response.error,
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

  /**
   * Get conversation state for a thread.
   * GET /field-note-agent/state/:threadId
   */
  async getState(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { threadId } = req.params;
    const { modelName, temperature } = req.query as {
      modelName?: ChatModel;
      temperature?: string;
    };

    if (!threadId) {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
    }

    try {
      // Use registry to get agent app
      const registry = getFieldNoteAgentRegistry();
      const { app } = await registry.getOrCreateApp({
        threadId,
        userId: req.user.id,
        prisma,
        modelName: modelName || 'gpt-4o',
        temperature: temperature ? parseFloat(temperature) : undefined,
      });

      const state = await getConversationState(app, threadId);

      return res.status(200).json({
        status: 'success',
        data: state,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw AppError.internal(`Failed to get state: ${errorMessage}`, 'AGENT_ERROR');
    }
  }

  private parseTemperature(temperature: number | string | undefined): number | undefined {
    if (temperature === undefined || temperature === null) {
      return undefined;
    }
    if (typeof temperature === 'number') {
      return temperature;
    }
    const parsed = Number(temperature);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return parsed;
  }

  private async buildAgentMessage(req: Request, message: string | undefined): Promise<string> {
    const file = req.file as MulterFile | undefined;
    const baseMessage = message?.trim();
    if (!file) {
      if (!baseMessage) {
        throw AppError.badRequest(
          'Message is required and must be a non-empty string',
          'INVALID_MESSAGE',
        );
      }
      return baseMessage;
    }
    const uploadedUrl = await this.uploadAgentFile(req.user!.id, file, req.body?.type as string);
    const messagePrefix = baseMessage ? `${baseMessage}\n\n` : '';
    const attachmentContext = await this.extractAttachmentContext(uploadedUrl, file.mimetype);
    const contextSuffix = attachmentContext ? `\n\n${attachmentContext}` : '';
    return `${messagePrefix}Attachment URL: ${uploadedUrl}\nAttachment Name: ${file.originalname}\nAttachment Type: ${file.mimetype}${contextSuffix}`;
  }

  private async uploadAgentFile(userId: string, file: MulterFile, type?: string): Promise<string> {
    const fileService = new FileService(userId);
    const resolvedType = type || file.mimetype;
    return await fileService.uploadFile(
      file,
      userId,
      FieldNoteAgentController.AGENT_UPLOAD_PATH,
      resolvedType,
    );
  }

  private async extractAttachmentContext(
    fileUrl: string,
    fileType: string,
  ): Promise<string | null> {
    const isSupported = fileType.startsWith('image/') || fileType === 'application/pdf';
    if (!isSupported) {
      return null;
    }
    try {
      const markdown = await extractMarkdownWithMistralOCRFromUrl(fileUrl);
      if (!markdown || markdown.trim().length === 0) {
        return null;
      }
      const snippet = this.limitText(markdown.trim(), 4000);
      return `Attachment OCR (markdown):\n${snippet}`;
    } catch {
      return null;
    }
  }

  private limitText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}\n\n[TRUNCATED]`;
  }
}
