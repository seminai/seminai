import { Request, Response } from 'express';
import { MessageRole, AgentResponseStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { approveAndExecute, getFieldNoteAgentRegistry } from '../../services/agents/field_note_agent';
import { ChatModel } from '../../services/agents/field_note_agent/graph';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export async function fieldNoteAgentControllerApprove(this: FieldNoteAgentControllerContext, req: Request, res: Response): Promise<Response> {
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
