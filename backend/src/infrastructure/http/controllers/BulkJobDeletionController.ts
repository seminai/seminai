import { Request, Response } from 'express';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';
import { BulkDeleteJobsUseCase } from '../../../application/use-cases/job/BulkDeleteJobsUseCase';
import { AppError } from '../../../domain/errors/AppError';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { getDosageAgentQueue } from '../../queue/DosageAgentQueue';
import { PrismaDosageAgentJobRepository } from '../../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../../repositories/Prisma';

/** Deletes persisted and queued jobs through their respective adapters. */
export class BulkJobDeletionController {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
    private readonly accessGuard: ResourceAccessGuard,
  ) {}

  async delete(request: Request, response: Response, userId: string): Promise<Response> {
    const { jobIds, force } = request.body as { jobIds: string[]; force?: boolean };
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      throw AppError.badRequest('Job IDs array is required and cannot be empty', 'EMPTY_JOB_IDS');
    }
    const { databaseIds, queueIds } = await this.partitionIds(jobIds);
    await this.accessGuard.assertJobs(userId, databaseIds);
    await this.assertQueueOwnership(queueIds, userId);
    const errors: string[] = [];
    const deletedFromDatabase = await this.deleteDatabaseJobs(databaseIds, errors);
    const deletedFromQueue = await this.deleteQueueJobs(queueIds, force === true, errors);
    const deletedCount = deletedFromDatabase + deletedFromQueue;
    if (deletedCount === 0 && errors.length === 0) {
      throw AppError.notFound(`Jobs not found: ${jobIds.join(', ')}`, 'JOBS_NOT_FOUND');
    }
    if (errors.length > 0 && deletedCount === 0) {
      return response.status(500).json({
        status: 'error',
        message: 'Failed to delete jobs',
        errors,
      });
    }
    const data = { deletedCount, deletedFromDatabase, deletedFromQueue };
    return errors.length > 0
      ? response.status(207).json({ status: 'partial_success', data: { ...data, errors } })
      : response.json({ status: 'success', data });
  }

  private async partitionIds(jobIds: string[]) {
    const databaseIds: string[] = [];
    const queueIds: string[] = [];
    for (const jobId of jobIds) {
      (await this.jobRepository.findById(jobId) ? databaseIds : queueIds).push(jobId);
    }
    return { databaseIds, queueIds };
  }

  private async assertQueueOwnership(queueIds: string[], userId: string): Promise<void> {
    if (queueIds.length === 0) return;
    const repository = new PrismaDosageAgentJobRepository(prisma);
    for (const queueId of queueIds) {
      const stored = await repository.findById(queueId);
      if (stored && stored.userId !== userId) {
        throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
      }
    }
  }

  private async deleteDatabaseJobs(ids: string[], errors: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      const result = await new BulkDeleteJobsUseCase(
        this.jobRepository,
        this.stockRepository,
      ).execute({ jobIds: ids });
      return result.deletedCount;
    } catch (error) {
      errors.push(`Database jobs: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  private async deleteQueueJobs(
    ids: string[],
    force: boolean,
    errors: string[],
  ): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      const result = await getDosageAgentQueue().removeJobs(ids, force);
      errors.push(...result.errors.map((error) => `Queue: ${error}`));
      return result.removedCount;
    } catch (error) {
      errors.push(`Queue jobs: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }
}
