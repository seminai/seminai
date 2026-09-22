import { Job } from '../../../domain/entities/Job';
import { JobGroupDTO } from '../../../domain/dtos/job-group.dto';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { AppError } from '../../../domain/errors/AppError';

export interface ListJobsGroupedByJobIdDTO {
  readonly userId: string;
}

export interface ListJobsGroupedByJobIdResponse {
  readonly groups: ReadonlyArray<JobGroupDTO>;
}

/**
 * Groups the caller's jobs by shared jobId. Never returns other tenants' jobs.
 */
export class ListJobsGroupedByJobIdUseCase {
  constructor(private readonly jobRepository: IJobRepository) {}

  async execute({ userId }: ListJobsGroupedByJobIdDTO): Promise<ListJobsGroupedByJobIdResponse> {
    if (!userId) {
      throw AppError.badRequest('User identifier is required', 'USER_ID_REQUIRED');
    }
    const assigned = await this.jobRepository.findManyByUserIdWithAssignment(userId);
    const groupedJobs = assigned.reduce<Map<string, Job[]>>((acc, item) => {
      const groupKey = item.job.jobId ?? '';
      const existingGroup = acc.get(groupKey);
      if (existingGroup) {
        existingGroup.push(item.job);
        return acc;
      }
      acc.set(groupKey, [item.job]);
      return acc;
    }, new Map<string, Job[]>());
    const groups = Array.from(groupedJobs.entries()).map(([jobId, jobList]) => ({
      jobId,
      jobs: jobList,
    }));
    return { groups };
  }
}
