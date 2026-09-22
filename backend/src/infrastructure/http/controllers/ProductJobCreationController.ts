import { Request, Response } from 'express';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';
import {
  BulkCreateJobItemDTO,
  BulkCreateProductAndJobUseCase,
} from '../../../application/use-cases/job/BulkCreateProductAndJobUseCase';
import { GetProductJobCreationStatusUseCase } from '../../../application/use-cases/job/GetProductJobCreationStatusUseCase';
import { StartProductJobCreationUseCase } from '../../../application/use-cases/job/StartProductJobCreationUseCase';
import { AppError } from '../../../domain/errors/AppError';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { getProductJobCreationQueue } from '../../queue/ProductJobCreationQueue';
import { prisma } from '../../repositories/Prisma';
import { PrismaDosageAgentJobRepository } from '../../repositories/PrismaDosageAgentJobRepository';

/** Handles synchronous and queued product-to-job creation. */
export class ProductJobCreationController {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
    private readonly accessGuard: ResourceAccessGuard,
    private readonly userRepository?: IUserRepository,
    private readonly productionUnitRepository?: IProductionUnitRepository,
    private readonly fieldRepository?: IFieldRepository,
    private readonly productRepository?: IProductRepository,
    private readonly warehouseRepository?: IWarehouseRepository,
  ) {}

  async create(request: Request, response: Response, userId: string): Promise<Response> {
    this.assertConfigured();
    const items = request.body as BulkCreateJobItemDTO[];
    const productionUnitIds = items
      .map((item) => item.productionUnitId)
      .filter((id): id is string => Boolean(id));
    await this.accessGuard.assertProductionUnits(userId, productionUnitIds);
    if (items.some((item) => !item.productionUnitId)) {
      const useCase = new StartProductJobCreationUseCase(
        getProductJobCreationQueue(),
        new PrismaDosageAgentJobRepository(prisma),
      );
      const { jobId } = await useCase.execute({ items, userId });
      return response.status(202).json({
        status: 'accepted',
        data: {
          jobId,
          message:
            'Creazione interventi avviata. Usa /jobs/create-product-and-job/status/:jobId per monitorare il progresso.',
        },
      });
    }
    const useCase = new BulkCreateProductAndJobUseCase(
      this.jobRepository,
      this.stockRepository,
      this.productRepository!,
      this.productionUnitRepository!,
      this.fieldRepository!,
      this.warehouseRepository!,
    );
    const { jobs } = await useCase.execute({ items });
    const jobProductLinks = await this.jobRepository.findManyByIdsWithProducts(
      jobs.map((job) => job.id),
    );
    return response.status(201).json({
      status: 'success',
      data: { jobs, jobProductLinks },
    });
  }

  async getStatus(request: Request, response: Response, userId: string): Promise<Response> {
    const { jobId } = request.params;
    if (!jobId) throw AppError.badRequest('Job ID is required', 'MISSING_JOB_ID');
    const useCase = new GetProductJobCreationStatusUseCase(
      getProductJobCreationQueue(),
      new PrismaDosageAgentJobRepository(prisma),
    );
    const result = await useCase.execute({ jobId, userId });
    return response.json({ status: 'success', data: result });
  }

  private assertConfigured(): void {
    if (
      !this.userRepository ||
      !this.productionUnitRepository ||
      !this.fieldRepository ||
      !this.productRepository ||
      !this.warehouseRepository
    ) {
      throw AppError.internal('Controller not properly configured', 'MISSING_DEPENDENCIES');
    }
  }
}
