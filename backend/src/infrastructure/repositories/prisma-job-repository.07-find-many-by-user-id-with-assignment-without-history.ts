import { JobWithAssignmentWithoutHistoryDTO } from '../../domain/dtos/job-assignment.dto';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindManyByUserIdWithAssignmentWithoutHistory(this: PrismaJobRepositoryContext, userId: string, companyName?: string, jobId?: string): Promise<JobWithAssignmentWithoutHistoryDTO[]> {
    const jobs = await this.findManyByUserIdWithAssignment(userId, companyName, jobId);
    return jobs.map((item) => ({
      ...item,
      job: this.removeHistoryFromJob(item.job),
    }));
  }
