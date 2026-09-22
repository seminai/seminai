import { JobWithAssignmentWithoutHistoryDTO } from '../../domain/dtos/job-assignment.dto';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindUnverifiedJobsByUserIdWithAssignment(this: PrismaJobRepositoryContext, userId: string, companyName?: string, jobGroupId?: string): Promise<JobWithAssignmentWithoutHistoryDTO[]> {
    const jobs = await this.findManyByUserIdWithAssignmentWithoutHistory(
      userId,
      companyName,
      jobGroupId,
    );
    return jobs.filter((item) => item.job.jobId !== null && !item.job.isVerified);
  }
