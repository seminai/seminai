import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { createJobVerificationAgentApp, getJobVerificationAgentState } from '../../services/agents/job_agent/ChatJobVerificationAgent';
import { ChatModel } from '../../services/agents/job_agent/graph';
import type { JobVerificationAgentControllerContext } from './job-verification-agent-controller.context';

export async function jobVerificationAgentControllerGetState(this: JobVerificationAgentControllerContext, req: Request, res: Response): Promise<Response> {
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
