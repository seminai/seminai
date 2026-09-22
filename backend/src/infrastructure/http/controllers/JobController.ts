import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { CreateJobUseCase } from '../../../application/use-cases/job/CreateJobUseCase';
import { ValidateManualJobComplianceUseCase } from '../../../application/use-cases/job/ValidateManualJobComplianceUseCase';
import type { Prisma } from '@prisma/client';
import { UpdateJobUseCase } from '../../../application/use-cases/job/UpdateJobUseCase';
import { DeleteJobUseCase } from '../../../application/use-cases/job/DeleteJobUseCase';
import { BulkDeleteJobsUseCase } from '../../../application/use-cases/job/BulkDeleteJobsUseCase';
import { BulkUpdateJobsUseCase } from '../../../application/use-cases/job/BulkUpdateJobsUseCase';
import { AssignUserToJobUseCase } from '../../../application/use-cases/job/AssignUserToJobUseCase';
import { ListJobsForCurrentUserUseCase } from '../../../application/use-cases/job/ListJobsForCurrentUserUseCase';
import { ListVerifiedJobsForCurrentUserUseCase } from '../../../application/use-cases/job/ListVerifiedJobsForCurrentUserUseCase';
import { ListJobsGroupedByJobIdUseCase } from '../../../application/use-cases/job/ListJobsGroupedByJobIdUseCase';
import { ListJobsByJobIdWithHistoryUseCase } from '../../../application/use-cases/job/ListJobsByJobIdWithHistoryUseCase';
import { ListJobGroupsSummaryUseCase } from '../../../application/use-cases/job/ListJobGroupsSummaryUseCase';
import {
  BulkCreateProductAndJobUseCase,
  BulkCreateJobItemDTO,
} from '../../../application/use-cases/job/BulkCreateProductAndJobUseCase';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { getDosageAgentQueue } from '../../queue/DosageAgentQueue';
import { prisma } from '../../repositories/Prisma';
import { getProductJobCreationQueue } from '../../queue/ProductJobCreationQueue';
import { StartProductJobCreationUseCase } from '../../../application/use-cases/job/StartProductJobCreationUseCase';
import { GetProductJobCreationStatusUseCase } from '../../../application/use-cases/job/GetProductJobCreationStatusUseCase';
import { PrismaDosageAgentJobRepository } from '../../repositories/PrismaDosageAgentJobRepository';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';

export class JobController {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
    private readonly accessGuard: ResourceAccessGuard,
    private readonly userRepository?: IUserRepository,
    private readonly productionUnitRepository?: IProductionUnitRepository,
    private readonly fieldRepository?: IFieldRepository,
    private readonly userOnCompanyRepository?: IUserOnCompanyRepository,
    private readonly productRepository?: IProductRepository,
    private readonly warehouseRepository?: IWarehouseRepository,
  ) {}

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  async create(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const productionUnitId =
      typeof request.body?.productionUnitId === 'string' ? request.body.productionUnitId : '';
    if (productionUnitId) {
      await this.accessGuard.assertProductionUnit(userId, productionUnitId);
    }
    const appliedRules = await this.computeManualJobAppliedRules(request.body, userId);
    const useCase = new CreateJobUseCase(this.jobRepository, this.stockRepository);
    const payload = appliedRules ? { ...request.body, appliedRules } : request.body;
    const { job } = await useCase.execute(payload);
    return response.status(201).json({ status: 'success', data: { job } });
  }

  /**
   * Runs rules-compliance validation for a manually-created job when the body
   * carries the necessary compliance metadata. Returns null when no validation
   * can be performed (missing fields or no vectorized rules).
   */
  private async computeManualJobAppliedRules(
    body: Record<string, unknown>,
    userId: string,
  ): Promise<Prisma.JsonValue | null> {
    const compliance = readManualComplianceInput(body);
    if (!compliance) return null;
    if (!this.userOnCompanyRepository) {
      throw AppError.internal('Controller not properly configured', 'MISSING_DEPENDENCIES');
    }
    try {
      const useCase = new ValidateManualJobComplianceUseCase(this.userOnCompanyRepository);
      const { appliedRules } = await useCase.execute({ ...compliance, userId });
      if (appliedRules.length === 0) return null;
      return appliedRules as unknown as Prisma.JsonValue;
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[JobController] Manual job compliance check failed: ${msg}`);
      return null;
    }
  }

  async bulkCreateProductAndJob(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    if (
      !this.userRepository ||
      !this.productionUnitRepository ||
      !this.fieldRepository ||
      !this.productRepository ||
      !this.warehouseRepository
    ) {
      throw AppError.internal('Controller not properly configured', 'MISSING_DEPENDENCIES');
    }
    const items = request.body as BulkCreateJobItemDTO[];
    const productionUnitIds = items
      .map((item) => item.productionUnitId)
      .filter((id): id is string => Boolean(id));
    await this.accessGuard.assertProductionUnits(userId, productionUnitIds);
    const needsResolution = items.some((item) => !item.productionUnitId);

    // ASYNC PATH: quando mancano le unità produttive, processa in background
    if (needsResolution) {
      const useCase = new StartProductJobCreationUseCase(
        getProductJobCreationQueue(),
        new PrismaDosageAgentJobRepository(prisma),
      );
      const { jobId } = await useCase.execute({
        items,
        userId,
      });
      return response.status(202).json({
        status: 'accepted',
        data: {
          jobId,
          message:
            'Creazione interventi avviata. Usa /jobs/create-product-and-job/status/:jobId per monitorare il progresso.',
        },
      });
    }

    // SYNC PATH: tutte le unità produttive sono presenti, esecuzione rapida
    const useCase = new BulkCreateProductAndJobUseCase(
      this.jobRepository,
      this.stockRepository,
      this.productRepository,
      this.productionUnitRepository,
      this.fieldRepository,
      this.warehouseRepository,
    );
    const { jobs } = await useCase.execute({ items });
    const jobProductLinks = await this.jobRepository.findManyByIdsWithProducts(
      jobs.map((job) => job.id),
    );
    return response.status(201).json({
      status: 'success',
      data: {
        jobs,
        jobProductLinks,
      },
    });
  }

  async getProductJobCreationStatus(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { jobId } = request.params;
    if (!jobId) {
      throw AppError.badRequest('Job ID is required', 'MISSING_JOB_ID');
    }
    const useCase = new GetProductJobCreationStatusUseCase(
      getProductJobCreationQueue(),
      new PrismaDosageAgentJobRepository(prisma),
    );
    const result = await useCase.execute({ jobId, userId });
    return response.json({ status: 'success', data: result });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const existing = await this.accessGuard.assertJob(userId, id);
    return response.json({ status: 'success', data: { job: existing } });
  }

  async listForCurrentUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const companyName = request.query.companyName as string | undefined;
    const useCase = new ListJobsForCurrentUserUseCase(this.jobRepository);
    const { jobs } = await useCase.execute({
      userId: request.user.id,
      companyName,
    });
    return response.json({ status: 'success', data: { jobs } });
  }

  async listVerifiedForCurrentUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const companyName = request.query.companyName as string | undefined;
    const pageParam = request.query.page as string | undefined;
    const limitParam = request.query.limit as string | undefined;
    const page = pageParam ? Number.parseInt(pageParam, 10) : undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const useCase = new ListVerifiedJobsForCurrentUserUseCase(this.jobRepository);
    const result = await useCase.execute({
      userId: request.user.id,
      companyName,
      page,
      limit,
    });
    return response.json({ status: 'success', data: result });
  }

  async listByProductionUnit(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { productionUnitId } = request.params;
    await this.accessGuard.assertProductionUnit(userId, productionUnitId);
    const list = await this.jobRepository.findManyByProductionUnitId(productionUnitId);
    return response.json({ status: 'success', data: { jobs: list } });
  }

  async listGroupedByJobId(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const useCase = new ListJobsGroupedByJobIdUseCase(this.jobRepository);
    const { groups } = await useCase.execute({ userId });
    return response.json({ status: 'success', data: { groups } });
  }

  async listJobGroupsSummary(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const useCase = new ListJobGroupsSummaryUseCase(this.jobRepository);
    const { groups } = await useCase.execute({ userId: request.user.id });
    return response.json({ status: 'success', data: { groups } });
  }

  async listByGroupJobId(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { jobId } = request.params;
    const useCase = new ListJobsByJobIdWithHistoryUseCase(this.jobRepository);
    const jobs = await useCase.execute({
      userId: request.user.id,
      jobId,
    });
    const transformedJobs = jobs.map((jobItem) => {
      const transformedJob = { ...jobItem.job };
      if (transformedJob.jobId && jobItem.dosageAgentJobName) {
        const lastDashIndex = transformedJob.jobId.lastIndexOf('-');
        if (lastDashIndex !== -1) {
          const baseJobId = transformedJob.jobId.substring(0, lastDashIndex);
          transformedJob.jobId = `${baseJobId}-${jobItem.dosageAgentJobName}`;
        }
      }
      return {
        ...jobItem,
        job: transformedJob,
      };
    });
    return response.json({ status: 'success', data: { jobs: transformedJobs } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.accessGuard.assertJob(userId, id);
    const useCase = new UpdateJobUseCase(this.jobRepository, this.stockRepository);

    const modifiedBy = {
      userId,
      name: request.user?.name || 'Unknown',
      email: request.user?.email || 'unknown@unknown.com',
    };

    const { job } = await useCase.execute({ id, modifiedBy, data: request.body });
    return response.json({ status: 'success', data: { job } });
  }

  async bulkUpdate(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { updates } = request.body as {
      updates: Array<{ id: string; data: Record<string, unknown> }>;
    };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      throw AppError.badRequest('Updates array is required and cannot be empty', 'EMPTY_UPDATES');
    }
    await this.accessGuard.assertJobs(
      userId,
      updates.map((update) => update.id),
    );

    const modifiedBy = {
      userId,
      name: request.user?.name || 'Unknown',
      email: request.user?.email || 'unknown@unknown.com',
    };

    const useCase = new BulkUpdateJobsUseCase(this.jobRepository, this.stockRepository);
    const result = await useCase.execute({ updates, modifiedBy });

    return response.json({
      status: 'success',
      data: { jobs: result.jobs, updatedCount: result.updatedCount },
    });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.accessGuard.assertJob(userId, id);
    const useCase = new DeleteJobUseCase(this.jobRepository, this.stockRepository);
    await useCase.execute(id);
    return response.status(204).send();
  }

  async bulkDelete(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { jobIds, force } = request.body as { jobIds: string[]; force?: boolean };
    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      throw AppError.badRequest('Job IDs array is required and cannot be empty', 'EMPTY_JOB_IDS');
    }
    const forceCancel = force === true;
    const dbJobIds: string[] = [];
    const queueJobIds: string[] = [];
    for (const jobId of jobIds) {
      const dbJob = await this.jobRepository.findById(jobId);
      if (dbJob) {
        dbJobIds.push(jobId);
      } else {
        queueJobIds.push(jobId);
      }
    }
    await this.accessGuard.assertJobs(userId, dbJobIds);
    if (queueJobIds.length > 0) {
      const dosageJobs = new PrismaDosageAgentJobRepository(prisma);
      for (const queueJobId of queueJobIds) {
        const stored = await dosageJobs.findById(queueJobId);
        if (stored && stored.userId !== userId) {
          throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
        }
      }
    }
    let deletedFromDb = 0;
    let deletedFromQueue = 0;
    const errors: string[] = [];
    if (dbJobIds.length > 0) {
      try {
        const useCase = new BulkDeleteJobsUseCase(this.jobRepository, this.stockRepository);
        const result = await useCase.execute({ jobIds: dbJobIds });
        deletedFromDb = result.deletedCount;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Database jobs: ${errorMessage}`);
      }
    }
    if (queueJobIds.length > 0) {
      try {
        const queue = getDosageAgentQueue();
        const result = await queue.removeJobs(queueJobIds, forceCancel);
        deletedFromQueue = result.removedCount;
        if (result.errors.length > 0) {
          errors.push(...result.errors.map((err) => `Queue: ${err}`));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Queue jobs: ${errorMessage}`);
      }
    }
    const totalDeleted = deletedFromDb + deletedFromQueue;
    if (totalDeleted === 0 && errors.length === 0) {
      throw AppError.notFound(`Jobs not found: ${jobIds.join(', ')}`, 'JOBS_NOT_FOUND');
    }
    if (errors.length > 0 && totalDeleted === 0) {
      return response.status(500).json({
        status: 'error',
        message: 'Failed to delete jobs',
        errors,
      });
    }
    if (errors.length > 0) {
      return response.status(207).json({
        status: 'partial_success',
        data: {
          deletedCount: totalDeleted,
          deletedFromDatabase: deletedFromDb,
          deletedFromQueue: deletedFromQueue,
          errors,
        },
      });
    }
    return response.json({
      status: 'success',
      data: {
        deletedCount: totalDeleted,
        deletedFromDatabase: deletedFromDb,
        deletedFromQueue: deletedFromQueue,
      },
    });
  }

  async assignUser(request: Request, response: Response): Promise<Response> {
    const callerId = this.requireUser(request);
    const { id } = request.params;
    const { userId } = request.body as { userId: string };
    await this.accessGuard.assertJob(callerId, id);
    if (
      !this.userRepository ||
      !this.productionUnitRepository ||
      !this.fieldRepository ||
      !this.userOnCompanyRepository
    ) {
      throw AppError.internal('Controller not properly configured', 'MISSING_DEPENDENCIES');
    }
    const useCase = new AssignUserToJobUseCase(
      this.jobRepository,
      this.userRepository,
      this.productionUnitRepository,
      this.fieldRepository,
      this.userOnCompanyRepository,
    );
    const { job } = await useCase.execute({ jobId: id, userId });
    return response.json({ status: 'success', data: { job } });
  }
}

interface ManualComplianceInput {
  readonly companyId: string;
  readonly productName: string;
  readonly activeIngredient: string;
  readonly dose: number;
  readonly doseUnit: string;
  readonly applicationDate: Date;
  readonly cropName: string;
  readonly maxApplications?: number;
}

/**
 * Reads compliance fields from a job-creation body. Returns null when any
 * required field is missing — compliance is opt-in for manual job creation.
 */
function readManualComplianceInput(body: Record<string, unknown>): ManualComplianceInput | null {
  const companyId = readString(body.companyId);
  const productName = readString(body.productName);
  const activeIngredient = readString(body.activeIngredient);
  const doseUnit = readString(body.doseUnit);
  const cropName = readString(body.cropName);
  const dose = readNumber(body.dose);
  const applicationDate = readDate(body.applicationDate ?? body.dateOfOpeation);
  if (!companyId || !productName || !activeIngredient || !doseUnit || !cropName) return null;
  if (dose === null || !applicationDate) return null;
  const maxApplications = readNumber(body.maxApplications);
  return {
    companyId,
    productName,
    activeIngredient,
    doseUnit,
    cropName,
    dose,
    applicationDate,
    maxApplications: maxApplications ?? undefined,
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
