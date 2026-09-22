import { Job } from '../../../domain/entities/Job';
import { AppError } from '../../../domain/errors/AppError';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';

export interface AssignUserToJobDTO {
  jobId: string;
  userId: string;
}

/**
 * Use case to assign a user as operator of a job.
 *
 * Validation steps:
 * - job exists
 * - user exists
 * - user belongs to the company that owns the job's field through its production unit
 */
export class AssignUserToJobUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly userRepository: IUserRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly fieldRepository: IFieldRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
  ) {}

  async execute(input: AssignUserToJobDTO): Promise<{ job: Job }> {
    if (!input.jobId || !input.userId) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const existingJob = await this.jobRepository.findById(input.jobId);
    if (!existingJob) {
      throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
    }

    const existingUser = await this.userRepository.findById(input.userId);
    if (!existingUser) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const productionUnit = await this.productionUnitRepository.findById(
      existingJob.productionUnitId,
    );
    if (!productionUnit) {
      throw AppError.internal('Production unit not found for job', 'PRODUCTION_UNIT_NOT_FOUND');
    }

    const fieldIds = await this.productionUnitRepository.listFieldIdsByProductionUnit(
      existingJob.productionUnitId,
    );
    const fieldId = fieldIds[0];
    const field = fieldId ? await this.fieldRepository.findById(fieldId) : null;
    if (!field) {
      throw AppError.internal('Field not found for production unit', 'FIELD_NOT_FOUND');
    }
    if (!field.companyId) {
      throw AppError.internal('Field has no associated company', 'FIELD_NO_COMPANY');
    }

    const membership = await this.userOnCompanyRepository.findByCompanyAndUser(
      field.companyId,
      input.userId,
    );
    if (!membership) {
      throw AppError.forbidden(
        'User does not belong to the company of the job',
        'USER_NOT_IN_COMPANY',
      );
    }

    const updated = await this.jobRepository.update(existingJob.id, { userId: input.userId });
    return { job: updated };
  }
}
