import { Request, Response } from 'express';
import { MessageRole, AgentResponseStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { handleUserMessage, getFieldNoteAgentRegistry } from '../../services/agents/field_note_agent';
import { ChatModel } from '../../services/agents/field_note_agent/graph';
import { AgentResponse } from '../../services/agents/field_note_agent';
import type { FieldNoteAgentControllerContext } from './field-note-agent-controller.context';

export async function fieldNoteAgentControllerMessage(this: FieldNoteAgentControllerContext, req: Request, res: Response): Promise<void> {
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
