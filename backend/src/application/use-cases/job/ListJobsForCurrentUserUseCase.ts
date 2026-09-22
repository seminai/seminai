import { AppError } from '../../../domain/errors/AppError';
import { JobWithAssignmentDTO } from '../../../domain/dtos/job-assignment.dto';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';

export interface ListJobsForCurrentUserDTO {
  readonly userId: string;
  readonly companyName?: string;
  readonly jobId?: string;
}

export class ListJobsForCurrentUserUseCase {
  constructor(private readonly jobRepository: IJobRepository) {}

  async execute({
    userId,
    companyName,
    jobId,
  }: ListJobsForCurrentUserDTO): Promise<{ jobs: JobWithAssignmentDTO[] }> {
    if (!userId) {
      throw AppError.badRequest('User identifier is required', 'USER_ID_REQUIRED');
    }

    const jobs = await this.jobRepository.findManyByUserIdWithAssignment(
      userId,
      companyName,
      jobId,
    );
    return { jobs };
  }
}
