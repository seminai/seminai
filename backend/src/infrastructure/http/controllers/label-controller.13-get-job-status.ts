import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { getLabelExtractionQueue } from '../../queue/LabelExtractionQueue';
import { getFertilizerLabelExtractionQueue } from '../../queue/FertilizerLabelExtractionQueue';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerGetJobStatus(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { jobId } = request.params as { jobId?: string };
    if (!jobId) {
      throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    }
    // Check standard queue first
    const queue = getLabelExtractionQueue();
    try {
      const status = await queue.getJobStatus(jobId);
      return response.json({ status: 'success', data: status });
    } catch (error) {
      // If not found in standard queue, try fertilizer queue
      const fertilizerQueue = getFertilizerLabelExtractionQueue();
      try {
        const status = await fertilizerQueue.getJobStatus(jobId);
        return response.json({ status: 'success', data: status });
      } catch (error2) {
        if (error2 instanceof Error && error2.message.includes('not found')) {
          throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
        }
        throw error2;
      }
    }
  }
