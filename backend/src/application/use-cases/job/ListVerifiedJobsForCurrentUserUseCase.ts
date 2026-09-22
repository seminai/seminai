import { AppError } from '../../../domain/errors/AppError';
import { JobWithAssignmentDTO } from '../../../domain/dtos/job-assignment.dto';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';

export interface ListVerifiedJobsForCurrentUserDTO {
  readonly userId: string;
  readonly companyName?: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface ListVerifiedJobsForCurrentUserResult {
  readonly jobs: JobWithAssignmentDTO[];
  readonly pagination: {
    readonly total: number;
    readonly page: number;
    readonly limit: number;
    readonly totalPages: number;
  };
}

export class ListVerifiedJobsForCurrentUserUseCase {
  constructor(private readonly jobRepository: IJobRepository) {}

  async execute({
    userId,
    companyName,
    page = 1,
    limit = 20,
  }: ListVerifiedJobsForCurrentUserDTO): Promise<ListVerifiedJobsForCurrentUserResult> {
    if (!userId) {
      throw AppError.badRequest('User identifier is required', 'USER_ID_REQUIRED');
    }
    const validPage = Math.max(1, page);
    const validLimit = Math.max(1, Math.min(100, limit));
    const skip = (validPage - 1) * validLimit;
    const { jobs, total } = await this.jobRepository.findVerifiedJobsByUserIdWithAssignment(
      userId,
      companyName,
      skip,
      validLimit,
    );
    const totalPages = Math.ceil(total / validLimit);
    return {
      jobs,
      pagination: {
        total,
        page: validPage,
        limit: validLimit,
        totalPages,
      },
    };
  }
}
