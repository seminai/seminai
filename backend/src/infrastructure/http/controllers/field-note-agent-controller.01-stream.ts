import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { streamFieldNoteAgentChat, StreamFieldNoteAgentOptions } from '../../services/agents/field_note_agent/streaming';
import { ChatModel } from '../../services/agents/field_note_agent/graph';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export async function fieldNoteAgentControllerStream(this: FieldNoteAgentControllerContext, req: Request, res: Response): Promise<void> {
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
