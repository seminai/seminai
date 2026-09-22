import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { AppError } from '../../../domain/errors/AppError';

export class DeleteJobUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.jobRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
    }
    await this.stockRepository.deleteByJobId(id);
    await this.jobRepository.delete(id);
  }
}
