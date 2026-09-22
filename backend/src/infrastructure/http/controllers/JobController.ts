import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { CreateJobUseCase } from '../../../application/use-cases/job/CreateJobUseCase';
import { ValidateManualJobComplianceUseCase } from '../../../application/use-cases/job/ValidateManualJobComplianceUseCase';
import type { Prisma } from '@prisma/client';
import { UpdateJobUseCase } from '../../../application/use-cases/job/UpdateJobUseCase';
import { DeleteJobUseCase } from '../../../application/use-cases/job/DeleteJobUseCase';
import { BulkUpdateJobsUseCase } from '../../../application/use-cases/job/BulkUpdateJobsUseCase';
import { AssignUserToJobUseCase } from '../../../application/use-cases/job/AssignUserToJobUseCase';
import { ListJobsForCurrentUserUseCase } from '../../../application/use-cases/job/ListJobsForCurrentUserUseCase';
import { ListVerifiedJobsForCurrentUserUseCase } from '../../../application/use-cases/job/ListVerifiedJobsForCurrentUserUseCase';
import { ListJobsGroupedByJobIdUseCase } from '../../../application/use-cases/job/ListJobsGroupedByJobIdUseCase';
import { ListJobsByJobIdWithHistoryUseCase } from '../../../application/use-cases/job/ListJobsByJobIdWithHistoryUseCase';
import { ListJobGroupsSummaryUseCase } from '../../../application/use-cases/job/ListJobGroupsSummaryUseCase';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';
import { requireAuthenticatedUserId } from './controller-auth';
import { readManualComplianceInput } from './manual-job-compliance';
import { BulkJobDeletionController } from './BulkJobDeletionController';
import { ProductJobCreationController } from './ProductJobCreationController';

export class JobController {
  private readonly bulkDeletionController: BulkJobDeletionController;
  private readonly productJobCreationController: ProductJobCreationController;

  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
    private readonly accessGuard: ResourceAccessGuard,
    private readonly userRepository?: IUserRepository,
    private readonly productionUnitRepository?: IProductionUnitRepository,
    private readonly fieldRepository?: IFieldRepository,
    private readonly userOnCompanyRepository?: IUserOnCompanyRepository,
    productRepository?: IProductRepository,
    warehouseRepository?: IWarehouseRepository,
  ) {
    this.bulkDeletionController = new BulkJobDeletionController(
      jobRepository,
      stockRepository,
      accessGuard,
    );
    this.productJobCreationController = new ProductJobCreationController(
      jobRepository,
      stockRepository,
      accessGuard,
      userRepository,
      productionUnitRepository,
      fieldRepository,
      productRepository,
      warehouseRepository,
    );
  }

  async create(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
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
    const userId = requireAuthenticatedUserId(request);
    return this.productJobCreationController.create(request, response, userId);
  }

  async getProductJobCreationStatus(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    return this.productJobCreationController.getStatus(request, response, userId);
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { id } = request.params;
    const existing = await this.accessGuard.assertJob(userId, id);
    return response.json({ status: 'success', data: { job: existing } });
  }

  async listForCurrentUser(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const companyName = request.query.companyName as string | undefined;
    const useCase = new ListJobsForCurrentUserUseCase(this.jobRepository);
    const { jobs } = await useCase.execute({
      userId,
      companyName,
    });
    return response.json({ status: 'success', data: { jobs } });
  }

  async listVerifiedForCurrentUser(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const companyName = request.query.companyName as string | undefined;
    const pageParam = request.query.page as string | undefined;
    const limitParam = request.query.limit as string | undefined;
    const page = pageParam ? Number.parseInt(pageParam, 10) : undefined;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const useCase = new ListVerifiedJobsForCurrentUserUseCase(this.jobRepository);
    const result = await useCase.execute({
      userId,
      companyName,
      page,
      limit,
    });
    return response.json({ status: 'success', data: result });
  }

  async listByProductionUnit(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { productionUnitId } = request.params;
    await this.accessGuard.assertProductionUnit(userId, productionUnitId);
    const list = await this.jobRepository.findManyByProductionUnitId(productionUnitId);
    return response.json({ status: 'success', data: { jobs: list } });
  }

  async listGroupedByJobId(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const useCase = new ListJobsGroupedByJobIdUseCase(this.jobRepository);
    const { groups } = await useCase.execute({ userId });
    return response.json({ status: 'success', data: { groups } });
  }

  async listJobGroupsSummary(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const useCase = new ListJobGroupsSummaryUseCase(this.jobRepository);
    const { groups } = await useCase.execute({ userId });
    return response.json({ status: 'success', data: { groups } });
  }

  async listByGroupJobId(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { jobId } = request.params;
    const useCase = new ListJobsByJobIdWithHistoryUseCase(this.jobRepository);
    const jobs = await useCase.execute({
      userId,
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
    const userId = requireAuthenticatedUserId(request);
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
    const userId = requireAuthenticatedUserId(request);
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
    const userId = requireAuthenticatedUserId(request);
    const { id } = request.params;
    await this.accessGuard.assertJob(userId, id);
    const useCase = new DeleteJobUseCase(this.jobRepository, this.stockRepository);
    await useCase.execute(id);
    return response.status(204).send();
  }

  async bulkDelete(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    return this.bulkDeletionController.delete(request, response, userId);
  }

  async assignUser(request: Request, response: Response): Promise<Response> {
    const callerId = requireAuthenticatedUserId(request);
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
