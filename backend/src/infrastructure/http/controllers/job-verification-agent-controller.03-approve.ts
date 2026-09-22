import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { createJobVerificationAgentApp, approveJobVerificationAction } from '../../services/agents/job_agent/ChatJobVerificationAgent';
import { ChatModel } from '../../services/agents/job_agent/graph';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { PrismaJobRepository } from '../../repositories/PrismaJobRepository';
import { AgentResponseStatus as MessageStatus } from '../../../domain/entities/Message';
import { UpdateJobUseCase } from '../../../application/use-cases/job/UpdateJobUseCase';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { sanitizeFieldValue } from './job-verification-agent-controller.support';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerApprove(this: JobVerificationAgentControllerContext, req: Request, res: Response): Promise<Response> {
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
