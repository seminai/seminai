import { AppError } from '../../../domain/errors/AppError';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { JobWithAssignmentDTO } from '../../../domain/dtos/job-assignment.dto';

export interface ListJobsByJobIdWithHistoryDTO {
  readonly userId: string;
  readonly jobId: string;
}

export class ListJobsByJobIdWithHistoryUseCase {
  constructor(private readonly jobRepository: IJobRepository) {}

  async execute({ userId, jobId }: ListJobsByJobIdWithHistoryDTO): Promise<JobWithAssignmentDTO[]> {
    if (!userId) {
      throw AppError.badRequest('User identifier is required', 'USER_ID_REQUIRED');
    }
    if (!jobId) {
      throw AppError.badRequest('Job identifier is required', 'JOB_ID_REQUIRED');
    }
    return this.jobRepository.findManyByUserIdWithAssignment(userId, undefined, jobId);
  }
}
