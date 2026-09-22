import { Prisma } from '@prisma/client';
import { Job } from '../../../domain/entities/Job';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Stock } from '../../../domain/entities/Stock';
import { CreateStockProps } from '../../../domain/dtos/stock.dto';
import { UpdatableJobProps } from '../../../domain/dtos/job.dto';
import {
  ModifyingUserInfo,
  calculateJobChanges,
  createJobSnapshot,
  createModificationEntry,
  mergeHistoryWithModification,
} from '../../../domain/dtos/job-modification.dto';

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export interface BulkUpdateJobsDTO {
  updates: Array<{
    id: string;
    data: UpdatableJobProps & { stocks?: CreateStockProps[] | null };
  }>;
  modifiedBy: ModifyingUserInfo;
  reason?: string;
}

export class BulkUpdateJobsUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute(input: BulkUpdateJobsDTO): Promise<{ jobs: Job[]; updatedCount: number }> {
    if (!input.updates || input.updates.length === 0) {
      throw AppError.badRequest('Updates array is required and cannot be empty', 'EMPTY_UPDATES');
    }

    const jobIds = input.updates.map((u) => u.id);

    // Fetch all jobs with company info in a single query
    const jobsWithCompany = await this.jobRepository.findManyByIdsWithCompany(jobIds);

    // Check for missing jobs
    const foundIds = new Set(jobsWithCompany.map((j) => j.job.id));
    const notFoundIds = jobIds.filter((id) => !foundIds.has(id));
    if (notFoundIds.length > 0) {
      throw AppError.notFound(`Jobs not found: ${notFoundIds.join(', ')}`, 'JOBS_NOT_FOUND');
    }

    // Validate all jobs belong to the same company
    const companyIds = new Set(jobsWithCompany.map((j) => j.companyId).filter(Boolean));
    if (companyIds.size > 1) {
      throw AppError.badRequest('All jobs must belong to the same company', 'MIXED_COMPANY_UPDATE');
    }

    // Build a map for quick lookup
    const existingJobMap = new Map(jobsWithCompany.map((j) => [j.job.id, j.job]));

    // Apply updates sequentially (each may involve stock operations)
    const updatedJobs: Job[] = [];

    for (const update of input.updates) {
      const existing = existingJobMap.get(update.id)!;

      // Handle stock replacement if provided
      if (typeof update.data.stocks !== 'undefined' && update.data.stocks !== null) {
        await this.stockRepository.deleteByJobId(update.id);
        if (update.data.stocks.length > 0) {
          const stocksToCreate: CreateStockProps[] = update.data.stocks.map((s) => ({
            ...s,
            jobId: update.id,
          }));
          const stockEntities = stocksToCreate.map((props) => Stock.create(props));
          await this.stockRepository.createMany(stockEntities);
        }
      }

      const {
        stocks: _stocks,
        conformityChecked: inputConformityChecked,
        ...jobData
      } = update.data;
      void _stocks;

      // Track modifications in history
      const changes = calculateJobChanges(existing, jobData);

      const updateData: Partial<Mutable<Job>> = { ...jobData };

      if (changes.length > 0) {
        const previousJobSnapshot = createJobSnapshot(existing);
        const modificationEntry = createModificationEntry(
          input.modifiedBy,
          changes,
          previousJobSnapshot,
          input.reason,
        );
        const updatedHistory = mergeHistoryWithModification(existing.history, modificationEntry);
        updateData.history = updatedHistory as unknown as Prisma.JsonValue;
      }

      if (typeof inputConformityChecked !== 'undefined') {
        updateData.conformityChecked = inputConformityChecked;
      }

      const updated = await this.jobRepository.update(update.id, updateData);
      updatedJobs.push(updated);
    }

    return { jobs: updatedJobs, updatedCount: updatedJobs.length };
  }
}
