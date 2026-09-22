import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import {
  streamJobVerificationChat,
  StreamJobVerificationOptions,
  JobVerificationInput,
  AgentResponse,
} from '../../services/agents/job_agent';
import {
  createJobVerificationAgentApp,
  handleJobVerificationMessage,
  approveJobVerificationAction,
  rejectJobVerificationAction,
  getJobVerificationAgentState,
} from '../../services/agents/job_agent/ChatJobVerificationAgent';
import { ChatModel } from '../../services/agents/job_agent/graph';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { PrismaJobRepository } from '../../repositories/PrismaJobRepository';
import { Chat, ChatCategory } from '../../../domain/entities/Chat';
import {
  Message,
  MessageRole,
  AgentResponseStatus as MessageStatus,
  MessageCost,
} from '../../../domain/entities/Message';
import { UpdateJobUseCase } from '../../../application/use-cases/job/UpdateJobUseCase';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { JobWithAssignmentDTO } from '../../../domain/dtos/job-assignment.dto';

type ChatContext = {
  chatRepository: PrismaChatRepository;
  userId: string;
  threadId: string;
  modelName?: string;
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
 * Controller for job verification agent chat operations.
 */
export class JobVerificationAgentController {
  /**
   * Stream chat response from the job verification agent.
   * POST /job-verification-agent/stream
   */
  async stream(req: Request, res: Response): Promise<void> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const {
      threadId,
      jobs,
      message,
      metadata,
      modelName,
      temperature,
      deepThinking = true,
    } = req.body as {
      threadId?: string;
      jobs?: JobWithAssignmentDTO[];
      message?: string;
      metadata?: { images?: string[]; links?: string[]; pdfs?: string[] };
      modelName?: ChatModel;
      temperature?: number;
      deepThinking?: boolean;
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

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders(); // Flush headers immediately to establish SSE connection

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

      const input: JobVerificationInput = {
        jobs,
        message,
        metadata,
      };

      const options: StreamJobVerificationOptions = {
        threadId,
        input,
        userId: req.user.id,
        modelName,
        temperature,
        deepThinking,
      };

      const streamIterator = streamJobVerificationChat(options);
      let assistantContent = '';
      let finalAgentResponse: AgentResponse | null = null;
      let finalCost: MessageCost | undefined;
      let finalStatus: MessageStatus | null = null;
      let finalPendingToolCalls: Array<Record<string, unknown>> | undefined;
      let finalError: string | undefined;
      let finalMetadata: Record<string, unknown> | undefined;

      // Helper to flush response (works with different server configurations)
      const flushResponse = () => {
        if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
          (res as unknown as { flush: () => void }).flush();
        }
      };

      while (true) {
        const { value, done } = await streamIterator.next();
        if (done) {
          finalAgentResponse = value ?? null;
          break;
        }

        const event = value;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        flushResponse(); // Flush immediately to send event to client

        // Handle different event types
        switch (event.type) {
          case 'token':
            assistantContent += event.content ?? '';
            break;

          case 'reasoning':
          case 'thinking':
          case 'tool_call':
          case 'tool_start':
          case 'tool_result':
          case 'task_update':
          case 'task_progress':
          case 'sources_update':
          case 'data_inspection':
            // Continue streaming, these are informational events
            break;

          case 'requires_approval':
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
            // Don't break - continue to receive more events
            break;

          case 'requires_modification_approval':
            finalStatus = MessageStatus.REQUIRES_APPROVAL;
            finalPendingToolCalls = event.pendingAction
              ? [
                  {
                    actionType: 'job_modification',
                    type: event.pendingAction.type,
                    tool: event.pendingAction.tool,
                    args: event.pendingAction.args,
                    modifications: event.pendingAction.modifications,
                    description: event.pendingAction.description,
                  },
                ]
              : undefined;
            // Don't break - continue to receive more events
            break;

          case 'complete':
            finalStatus = MessageStatus.COMPLETED;
            if (event.cost) {
              finalCost = {
                inputTokens: event.cost.inputTokens,
                outputTokens: event.cost.outputTokens,
                tavilyCalls: event.cost.tavilyCalls,
                totalCostUsd: event.cost.totalCostUsd,
                costWithMarginUsd: event.cost.costWithMarginUsd,
              };
            }
            finalMetadata = {
              sources: event.sources,
              tasks: event.tasks,
              reasoning: event.reasoning,
            };
            // Extract response message if available
            if (event.response?.message) {
              assistantContent = event.response.message;
            }
            // Store the response for later use
            if (event.response) {
              finalAgentResponse = event.response;
            }
            // Stream is complete, exit the loop
            break;

          case 'error':
            finalStatus = MessageStatus.ERROR;
            finalError = event.error;
            this.logStreamError({
              threadId,
              eventType: 'error',
              error: event.error,
            });
            break;

          default:
            // Unknown event type, just continue
            break;
        }

        // Exit loop on terminal events
        if (event.type === 'complete' || event.type === 'error') {
          break;
        }
      }

      if (!finalStatus && finalAgentResponse) {
        finalStatus = this.mapAgentStatus(finalAgentResponse.status);
        finalPendingToolCalls = finalAgentResponse.pendingAction
          ? [{ ...finalAgentResponse.pendingAction } as Record<string, unknown>]
          : undefined;
        finalError = finalAgentResponse.error;
        finalMetadata = {
          sources: finalAgentResponse.sources,
          tasks: finalAgentResponse.tasks,
          reasoning: finalAgentResponse.reasoning,
        };
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
          metadata: finalMetadata,
        });
      }

      res.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logStreamError({
        threadId: typeof req.body?.threadId === 'string' ? req.body.threadId : 'unknown',
        eventType: 'stream_exception',
        error,
      });
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
      res.end();
    }
  }

  /**
   * Handle non-streaming chat message.
   * POST /job-verification-agent/message
   */
  async message(req: Request, res: Response): Promise<Response> {
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

  /**
   * Approve pending tool execution or modification.
   * POST /job-verification-agent/approve
   */
  async approve(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    type SingleModification = { jobId: string; field: string; newValue: unknown };
    const { threadId, modelName, temperature, modification, modifications } = req.body as {
      threadId?: string;
      modelName?: ChatModel;
      temperature?: number;
      /** Single modification (legacy) */
      modification?: SingleModification;
      /** Multiple modifications (e.g. 2 jobs reduced by 10% at once) */
      modifications?: SingleModification[];
    };

    // Normalize to a unified array — prefer explicit `modifications[]`, fall back to singular
    const modificationsToApply: SingleModification[] =
      modifications && modifications.length > 0
        ? modifications
        : modification
          ? [modification]
          : [];

    if (!threadId || typeof threadId !== 'string') {
      throw AppError.badRequest('ThreadId is required', 'INVALID_THREAD_ID');
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

      // If one or more modifications are provided, apply them all directly
      if (modificationsToApply.length > 0) {
        const jobRepository = new PrismaJobRepository(prisma);
        const stockRepository = new PrismaStockRepository(prisma);
        const updateJobUseCase = new UpdateJobUseCase(jobRepository, stockRepository);

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { id: true, name: true, email: true },
        });

        if (!user) {
          throw AppError.notFound('User not found', 'USER_NOT_FOUND');
        }

        for (const mod of modificationsToApply) {
          await updateJobUseCase.execute({
            id: mod.jobId,
            modifiedBy: {
              userId: user.id,
              name: user.name || 'Unknown',
              email: user.email,
            },
            data: {
              [mod.field]: sanitizeFieldValue(mod.field, mod.newValue),
              conformityChecked: false,
            },
          });
        }

        const summaryLines = modificationsToApply.map(
          (m) => `- **${m.field}** (job ${m.jobId.slice(0, 8)}…) → ${JSON.stringify(m.newValue)}`,
        );
        const successMessage =
          modificationsToApply.length === 1
            ? `Modifica applicata: **${modificationsToApply[0].field}** aggiornato a ${JSON.stringify(modificationsToApply[0].newValue)}.`
            : `${modificationsToApply.length} modifiche applicate:\n${summaryLines.join('\n')}`;

        await this.saveUserMessage({
          messageRepository,
          chatId: chat.id,
          content: `User approved ${modificationsToApply.length} modification(s)`,
          metadata: { action: 'APPROVE_MODIFICATION', modifications: modificationsToApply },
        });

        await this.saveAssistantMessage({
          messageRepository,
          chatId: chat.id,
          content: successMessage,
          status: MessageStatus.COMPLETED,
        });

        return res.status(200).json({
          status: 'success',
          data: {
            status: 'COMPLETED',
            message: successMessage,
            appliedCount: modificationsToApply.length,
          },
        });
      }

      // No modifications in body — try to recover them from the last pending chat message
      // (this happens when the frontend sends only threadId after a quick-mode proposal)
      const recoveredModifications = await this.recoverPendingModificationsFromChat(
        chat.id,
        prisma,
      );

      if (recoveredModifications.length > 0) {
        const jobRepository = new PrismaJobRepository(prisma);
        const stockRepository = new PrismaStockRepository(prisma);
        const updateJobUseCase = new UpdateJobUseCase(jobRepository, stockRepository);

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { id: true, name: true, email: true },
        });

        if (!user) {
          throw AppError.notFound('User not found', 'USER_NOT_FOUND');
        }

        for (const mod of recoveredModifications) {
          await updateJobUseCase.execute({
            id: mod.jobId,
            modifiedBy: {
              userId: user.id,
              name: user.name || 'Unknown',
              email: user.email,
            },
            data: {
              [mod.field]: sanitizeFieldValue(mod.field, mod.newValue),
              conformityChecked: false,
            },
          });
        }

        const summaryLines = recoveredModifications.map(
          (m) =>
            `- **${(m as { jobName?: string }).jobName || m.jobId.slice(0, 8)}** ${m.field}: ${m.oldValue} → ${m.newValue}`,
        );
        const successMessage =
          recoveredModifications.length === 1
            ? `Modifica applicata: **${recoveredModifications[0].field}** aggiornato a ${JSON.stringify(recoveredModifications[0].newValue)}.`
            : `${recoveredModifications.length} modifiche applicate:\n${summaryLines.join('\n')}`;

        await this.saveUserMessage({
          messageRepository,
          chatId: chat.id,
          content: `User approved ${recoveredModifications.length} modification(s) (recovered)`,
          metadata: { action: 'APPROVE_MODIFICATION', modifications: recoveredModifications },
        });

        await this.saveAssistantMessage({
          messageRepository,
          chatId: chat.id,
          content: successMessage,
          status: MessageStatus.COMPLETED,
        });

        return res.status(200).json({
          status: 'success',
          data: {
            status: 'COMPLETED',
            message: successMessage,
            appliedCount: recoveredModifications.length,
          },
        });
      }

      // No modifications in body or in chat — resume the LangGraph thread (deep thinking mode approval)
      await this.saveUserMessage({
        messageRepository,
        chatId: chat.id,
        content: 'User approved the pending tool execution.',
        metadata: { action: 'APPROVE' },
      });

      const app = createJobVerificationAgentApp({
        modelName: modelName || 'gpt-4o',
        temperature,
        userId: req.user.id,
      });

      const response = await approveJobVerificationAction(app, threadId);

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
      throw AppError.internal(`Failed to approve action: ${errorMessage}`, 'AGENT_ERROR');
    }
  }

  /**
   * Reject pending tool execution or modification.
   * POST /job-verification-agent/reject
   */
  async reject(req: Request, res: Response): Promise<Response> {
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

  /**
   * Get conversation state for a thread.
   * GET /job-verification-agent/state/:threadId
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
      const app = createJobVerificationAgentApp({
        modelName: modelName || 'gpt-4o',
        temperature: temperature ? parseFloat(temperature) : undefined,
        userId: req.user.id,
      });

      const state = await getJobVerificationAgentState(app, threadId);

      return res.status(200).json({
        status: 'success',
        data: state,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw AppError.internal(`Failed to get state: ${errorMessage}`, 'AGENT_ERROR');
    }
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
      return existingChat;
    }

    return chatRepository.create(
      Chat.create({
        userId,
        threadId,
        category: ChatCategory.JOB_VERIFICATION_AGENT,
        modelName,
        temperature,
      }),
    );
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

  /**
   * Reads the last REQUIRES_APPROVAL message in a chat and extracts
   * the pending job modifications from its pendingToolCalls metadata.
   * Used to recover modifications when the frontend sends only threadId on approve.
   */
  private async recoverPendingModificationsFromChat(
    chatId: string,
    db: typeof prisma,
  ): Promise<PendingModificationRecord[]> {
    const lastPendingMessage = await db.message.findFirst({
      where: {
        chatId,
        role: 'ASSISTANT',
        status: 'REQUIRES_APPROVAL',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastPendingMessage?.pendingToolCalls) return [];

    const toolCalls = lastPendingMessage.pendingToolCalls as unknown as Array<
      Record<string, unknown>
    >;

    for (const tc of toolCalls) {
      if (tc.actionType === 'job_modification' && Array.isArray(tc.modifications)) {
        return tc.modifications as PendingModificationRecord[];
      }
    }

    return [];
  }

  private mapAgentStatus(
    status:
      | 'COMPLETED'
      | 'REQUIRES_APPROVAL'
      | 'REQUIRES_MODIFICATION_APPROVAL'
      | 'PROCESSING'
      | 'ERROR',
  ): MessageStatus {
    switch (status) {
      case 'COMPLETED':
        return MessageStatus.COMPLETED;
      case 'REQUIRES_APPROVAL':
      case 'REQUIRES_MODIFICATION_APPROVAL':
        return MessageStatus.REQUIRES_APPROVAL;
      case 'PROCESSING':
        return MessageStatus.COMPLETED; // Map to completed for now
      case 'ERROR':
      default:
        return MessageStatus.ERROR;
    }
  }

  private getDefaultAssistantMessage(status: MessageStatus): string {
    if (status === MessageStatus.REQUIRES_APPROVAL) {
      return "L'agente richiede la tua approvazione per procedere.";
    }

    if (status === MessageStatus.ERROR) {
      return "Si è verificato un errore durante l'elaborazione della richiesta.";
    }

    return 'Elaborazione completata.';
  }

  private logStreamError({
    threadId,
    eventType,
    error,
  }: {
    threadId: string;
    eventType: string;
    error: unknown;
  }): void {
    const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error('[JOB-VERIFICATION-STREAM] Error event', {
      threadId,
      eventType,
      errorName,
      errorMessage,
    });
  }
}

type PendingModificationRecord = {
  jobId: string;
  jobName?: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

/**
 * Numeric fields on a Job that must be stored as Float, not string.
 * The LLM may return values like "1.53 L" or "2.00" — we parse the numeric part.
 */
const NUMERIC_JOB_FIELDS = new Set([
  'quantity',
  'treatedSurface',
  'productQuantityTreated',
  'totalDistributedWaterL',
]);

/**
 * Sanitizes a field value before persisting it.
 * For known numeric fields, extracts the numeric part from strings (e.g. "1.53 L" → 1.53).
 */
function sanitizeFieldValue(field: string, value: unknown): unknown {
  if (!NUMERIC_JOB_FIELDS.has(field)) return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(',', '.'));
    if (!isNaN(parsed)) return parsed;
  }
  return value;
}
