import { PrismaClient } from '@prisma/client';
import { Job } from '../../domain/entities/Job';
import { JobWithAssignmentDTO, JobWithAssignmentWithoutHistoryDTO, JobWithoutHistory } from '../../domain/dtos/job-assignment.dto';
import { JobGroupSummaryDTO } from '../../domain/dtos/job-group-summary.dto';
import { JobProductLinkDTO } from '../../domain/dtos/job-product-link.dto';
import { IJobRepository } from '../../domain/repositories/IJobRepository';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';
import { prismaJobRepositoryCreate } from './prisma-job-repository.01-create';
import { prismaJobRepositoryCreateMany } from './prisma-job-repository.02-create-many';
import { prismaJobRepositoryFindById } from './prisma-job-repository.03-find-by-id';
import { prismaJobRepositoryFindAll } from './prisma-job-repository.04-find-all';
import { prismaJobRepositoryFindManyByProductionUnitId } from './prisma-job-repository.05-find-many-by-production-unit-id';
import { prismaJobRepositoryFindManyByUserIdWithAssignment } from './prisma-job-repository.06-find-many-by-user-id-with-assignment';
import { prismaJobRepositoryFindManyByUserIdWithAssignmentWithoutHistory } from './prisma-job-repository.07-find-many-by-user-id-with-assignment-without-history';
import { prismaJobRepositoryFindUnverifiedJobsByUserIdWithAssignment } from './prisma-job-repository.08-find-unverified-jobs-by-user-id-with-assignment';
import { prismaJobRepositoryFindVerifiedJobsByUserIdWithAssignment } from './prisma-job-repository.09-find-verified-jobs-by-user-id-with-assignment';
import { prismaJobRepositoryFindManyByIdsWithProducts } from './prisma-job-repository.10-find-many-by-ids-with-products';
import { prismaJobRepositoryFindManyByIdsWithCompany } from './prisma-job-repository.11-find-many-by-ids-with-company';
import { prismaJobRepositoryUpdate } from './prisma-job-repository.12-update';
import { prismaJobRepositoryDelete } from './prisma-job-repository.13-delete';
import { prismaJobRepositoryDeleteMany } from './prisma-job-repository.14-delete-many';
import { prismaJobRepositoryFindJobGroupsSummaryByUserId } from './prisma-job-repository.15-find-job-groups-summary-by-user-id';
import { prismaJobRepositoryRemoveHistoryFromJob } from './prisma-job-repository.16-remove-history-from-job';


export class PrismaJobRepository implements IJobRepository {

  constructor(readonly prisma: PrismaClient) {}

  async create(job: Job): Promise<Job> {
    return prismaJobRepositoryCreate.call(this as unknown as PrismaJobRepositoryContext, job);
  }

  async createMany(jobs: Job[]): Promise<void> {
    return prismaJobRepositoryCreateMany.call(this as unknown as PrismaJobRepositoryContext, jobs);
  }

  async findById(id: string): Promise<Job | null> {
    return prismaJobRepositoryFindById.call(this as unknown as PrismaJobRepositoryContext, id);
  }

  async findAll(): Promise<Job[]> {
    return prismaJobRepositoryFindAll.call(this as unknown as PrismaJobRepositoryContext);
  }

  async findManyByProductionUnitId(productionUnitId: string): Promise<Job[]> {
    return prismaJobRepositoryFindManyByProductionUnitId.call(this as unknown as PrismaJobRepositoryContext, productionUnitId);
  }

  async findManyByUserIdWithAssignment(
    userId: string,
    companyName?: string,
    jobId?: string,
  ): Promise<JobWithAssignmentDTO[]> {
    return prismaJobRepositoryFindManyByUserIdWithAssignment.call(this as unknown as PrismaJobRepositoryContext, userId, companyName, jobId);
  }

  async findManyByUserIdWithAssignmentWithoutHistory(
    userId: string,
    companyName?: string,
    jobId?: string,
  ): Promise<JobWithAssignmentWithoutHistoryDTO[]> {
    return prismaJobRepositoryFindManyByUserIdWithAssignmentWithoutHistory.call(this as unknown as PrismaJobRepositoryContext, userId, companyName, jobId);
  }

  async findUnverifiedJobsByUserIdWithAssignment(
    userId: string,
    companyName?: string,
    jobGroupId?: string,
  ): Promise<JobWithAssignmentWithoutHistoryDTO[]> {
    return prismaJobRepositoryFindUnverifiedJobsByUserIdWithAssignment.call(this as unknown as PrismaJobRepositoryContext, userId, companyName, jobGroupId);
  }

  async findVerifiedJobsByUserIdWithAssignment(
    userId: string,
    companyName?: string,
    skip?: number,
    take?: number,
  ): Promise<{ jobs: JobWithAssignmentDTO[]; total: number }> {
    return prismaJobRepositoryFindVerifiedJobsByUserIdWithAssignment.call(this as unknown as PrismaJobRepositoryContext, userId, companyName, skip, take);
  }

  async findManyByIdsWithProducts(jobIds: string[]): Promise<JobProductLinkDTO[]> {
    return prismaJobRepositoryFindManyByIdsWithProducts.call(this as unknown as PrismaJobRepositoryContext, jobIds);
  }

  async findManyByIdsWithCompany(
    ids: string[],
  ): Promise<Array<{ job: Job; companyId: string | null }>> {
    return prismaJobRepositoryFindManyByIdsWithCompany.call(this as unknown as PrismaJobRepositoryContext, ids);
  }

  async update(id: string, data: Partial<Job>): Promise<Job> {
    return prismaJobRepositoryUpdate.call(this as unknown as PrismaJobRepositoryContext, id, data);
  }

  async delete(id: string): Promise<void> {
    return prismaJobRepositoryDelete.call(this as unknown as PrismaJobRepositoryContext, id);
  }

  async deleteMany(ids: string[]): Promise<void> {
    return prismaJobRepositoryDeleteMany.call(this as unknown as PrismaJobRepositoryContext, ids);
  }

  async findJobGroupsSummaryByUserId(userId: string): Promise<JobGroupSummaryDTO[]> {
    return prismaJobRepositoryFindJobGroupsSummaryByUserId.call(this as unknown as PrismaJobRepositoryContext, userId);
  }

  removeHistoryFromJob(job: Job): JobWithoutHistory {
    return prismaJobRepositoryRemoveHistoryFromJob.call(this as unknown as PrismaJobRepositoryContext, job);
  }
}
