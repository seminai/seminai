import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { AppError } from '../../../domain/errors/AppError';

export interface BulkDeleteJobsDTO {
  readonly jobIds: string[];
}

export class BulkDeleteJobsUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute({ jobIds }: BulkDeleteJobsDTO): Promise<{ deletedCount: number }> {
    if (!jobIds || jobIds.length === 0) {
      throw AppError.badRequest('Job IDs array is required and cannot be empty', 'EMPTY_JOB_IDS');
    }

    const existingJobs = await Promise.all(jobIds.map((id) => this.jobRepository.findById(id)));

    const notFoundIds = jobIds.filter((_, index) => !existingJobs[index]);
    if (notFoundIds.length > 0) {
      throw AppError.notFound(`Jobs not found: ${notFoundIds.join(', ')}`, 'JOBS_NOT_FOUND');
    }

    for (const jobId of jobIds) {
      await this.stockRepository.deleteByJobId(jobId);
    }

    await this.jobRepository.deleteMany(jobIds);

    return { deletedCount: jobIds.length };
  }
}
