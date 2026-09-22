import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { getConversationState, getFieldNoteAgentRegistry } from '../../services/agents/field_note_agent';
import { ChatModel } from '../../services/agents/field_note_agent/graph';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export async function fieldNoteAgentControllerGetState(this: FieldNoteAgentControllerContext, req: Request, res: Response): Promise<Response> {
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
