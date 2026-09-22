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

export interface UpdateJobDTO {
  id: string;
  modifiedBy?: ModifyingUserInfo;
  reason?: string;
  data: UpdatableJobProps & {
    stocks?: CreateStockProps[] | null;
  };
}

export class UpdateJobUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute(input: UpdateJobDTO): Promise<{ job: Job }> {
    const existing = await this.jobRepository.findById(input.id);
    if (!existing) {
      throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
    }

    // If stocks are provided, we replace existing job-bound stocks with the new set
    if (typeof input.data.stocks !== 'undefined' && input.data.stocks !== null) {
      // delete previous stocks attached to job
      await this.stockRepository.deleteByJobId(input.id);
      if (input.data.stocks.length > 0) {
        // recreate attached stocks with current job id
        const stocksToCreate: CreateStockProps[] = input.data.stocks.map((s) => ({
          ...s,
          jobId: input.id,
        }));
        const stockEntities = stocksToCreate.map((props) => Stock.create(props));
        await this.stockRepository.createMany(stockEntities);
      }
    }

    const { stocks: _stocks, conformityChecked: inputConformityChecked, ...jobData } = input.data;
    void _stocks;

    console.log('[UpdateJobUseCase] input.modifiedBy:', input.modifiedBy);
    console.log('[UpdateJobUseCase] jobData:', jobData);
    console.log('[UpdateJobUseCase] inputConformityChecked:', inputConformityChecked);

    // Track modifications in history if modifiedBy info is provided
    if (input.modifiedBy) {
      const changes = calculateJobChanges(existing, jobData);
      console.log('[UpdateJobUseCase] changes:', changes);
      console.log('[UpdateJobUseCase] changes.length:', changes.length);

      if (changes.length > 0) {
        const previousJobSnapshot = createJobSnapshot(existing);
        const modificationEntry = createModificationEntry(
          input.modifiedBy,
          changes,
          previousJobSnapshot,
          input.reason,
        );
        const updatedHistory = mergeHistoryWithModification(existing.history, modificationEntry);

        // Update with history and user-provided conformityChecked (only if explicitly provided)
        const updateData: Partial<Mutable<Job>> = {
          ...jobData,
          history: updatedHistory as unknown as Prisma.JsonValue,
        };
        if (typeof inputConformityChecked !== 'undefined') {
          updateData.conformityChecked = inputConformityChecked;
        }
        const updated = await this.jobRepository.update(input.id, updateData);
        return { job: updated };
      }

      // No changes detected but user is modifying - apply user's conformityChecked value only if provided
      const updateData: Partial<Mutable<Job>> = {
        ...jobData,
      };
      if (typeof inputConformityChecked !== 'undefined') {
        updateData.conformityChecked = inputConformityChecked;
      }
      const updated = await this.jobRepository.update(input.id, updateData);
      return { job: updated };
    }

    // No modifiedBy provided (internal/system update), just update the job data
    const updated = await this.jobRepository.update(input.id, jobData);
    return { job: updated };
  }
}
