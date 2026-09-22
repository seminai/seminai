import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { streamJobVerificationChat, StreamJobVerificationOptions, JobVerificationInput, AgentResponse } from '../../services/agents/job_agent';
import { ChatModel } from '../../services/agents/job_agent/graph';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { AgentResponseStatus as MessageStatus, MessageCost } from '../../../domain/entities/Message';
import { JobWithAssignmentDTO } from '../../../domain/dtos/job-assignment.dto';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerStream(this: JobVerificationAgentControllerContext, req: Request, res: Response): Promise<void> {
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
