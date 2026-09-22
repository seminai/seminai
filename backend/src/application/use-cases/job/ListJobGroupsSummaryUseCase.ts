import { AppError } from '../../../domain/errors/AppError';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { JobGroupSummaryDTO } from '../../../domain/dtos/job-group-summary.dto';

export interface ListJobGroupsSummaryDTO {
  readonly userId: string;
}

export class ListJobGroupsSummaryUseCase {
  constructor(private readonly jobRepository: IJobRepository) {}

  async execute({ userId }: ListJobGroupsSummaryDTO): Promise<{ groups: JobGroupSummaryDTO[] }> {
    if (!userId) {
      throw AppError.badRequest('User identifier is required', 'USER_ID_REQUIRED');
    }
    const groups = await this.jobRepository.findJobGroupsSummaryByUserId(userId);
    return { groups };
  }
}
