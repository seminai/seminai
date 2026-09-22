import { Request, Response } from 'express';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { AppError } from '../../../domain/errors/AppError';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { CreateProductionUnitUseCase } from '../../../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { CreateProductionUnitsBulkUseCase } from '../../../application/use-cases/production-unit/CreateProductionUnitsBulkUseCase';
import { UpdateProductionUnitUseCase } from '../../../application/use-cases/production-unit/UpdateProductionUnitUseCase';
import { DeleteProductionUnitUseCase } from '../../../application/use-cases/production-unit/DeleteProductionUnitUseCase';
import { DeleteProductionUnitsBulkUseCase } from '../../../application/use-cases/production-unit/DeleteProductionUnitsBulkUseCase';
import { ListProductionUnitsByUserUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByUserUseCase';
import { ListProductionUnitsByCropUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByCropUseCase';
import { ListProductionUnitsByCompaniesUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByCompaniesUseCase';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { requireAuthenticatedUserId } from './controller-auth';
import { ProductionUnitExtractionController } from './ProductionUnitExtractionController';
import {
  normalizeBulkProductionUnits,
  ProductionUnitBulkInput,
} from './production-unit-request';

export class ProductionUnitController {
  private readonly extractionController: ProductionUnitExtractionController;

  constructor(
    private readonly repository: IProductionUnitRepository,
    private readonly fieldRepository: IFieldRepository,
    private readonly createUseCase: CreateProductionUnitUseCase,
    private readonly createBulkUseCase: CreateProductionUnitsBulkUseCase,
    private readonly updateUseCase: UpdateProductionUnitUseCase,
    private readonly deleteUseCase: DeleteProductionUnitUseCase,
    private readonly deleteBulkUseCase: DeleteProductionUnitsBulkUseCase,
    private readonly listByUserUseCase: ListProductionUnitsByUserUseCase,
    private readonly listByCropUseCase: ListProductionUnitsByCropUseCase,
    private readonly listByCompaniesUseCase: ListProductionUnitsByCompaniesUseCase,
    private readonly accessGuard: ResourceAccessGuard,
  ) {
    this.extractionController = new ProductionUnitExtractionController(fieldRepository);
  }

  private async assertAllocationAccess(
    userId: string,
    allocations: Array<{ fieldId: string }>,
  ): Promise<void> {
    for (const allocation of allocations) {
      const field = await this.fieldRepository.findById(allocation.fieldId);
      if (!field) {
        throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
      }
      await this.accessGuard.assertMember(userId, field.companyId);
    }
  }

  async create(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as Parameters<CreateProductionUnitUseCase['execute']>[0];
    await this.assertAllocationAccess(userId, body.allocations ?? []);
    const { productionUnit } = await this.createUseCase.execute(body);
    return response.status(201).json({ status: 'success', data: { productionUnit } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { id } = request.params;
    await this.accessGuard.assertProductionUnit(userId, id);
    const data = request.body;
    if (Array.isArray(data?.allocations)) {
      await this.assertAllocationAccess(userId, data.allocations);
    }
    const { productionUnit } = await this.updateUseCase.execute({ id, data });
    return response.json({ status: 'success', data: { productionUnit } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { id } = request.params;
    await this.accessGuard.assertProductionUnit(userId, id);
    await this.deleteUseCase.execute(id);
    return response.status(204).send();
  }

  async listByField(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    const { fieldId } = request.params;
    const list = await this.repository.findManyByFieldId(fieldId);
    return response.json({ status: 'success', data: { productionUnits: list } });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { id } = request.params;
    const productionUnit = await this.accessGuard.assertProductionUnit(userId, id);
    const fieldIds = await this.repository.listFieldIdsByProductionUnit(id);
    return response.json({ status: 'success', data: { productionUnit, fieldIds } });
  }

  async listByUser(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { productionUnits } = await this.listByUserUseCase.execute(userId);
    return response.json({ status: 'success', data: { productionUnits } });
  }

  async listByCrop(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { cropName } = request.query;
    if (!cropName || typeof cropName !== 'string') {
      throw AppError.badRequest('Missing or invalid cropName parameter', 'MISSING_CROP_NAME');
    }
    const { productionUnits } = await this.listByCropUseCase.execute(userId, cropName);
    return response.json({ status: 'success', data: { productionUnits } });
  }

  async listByCompanies(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { companyIds } = request.body as { companyIds?: string[] };
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      throw AppError.badRequest('Missing or invalid companyIds array', 'MISSING_COMPANY_IDS');
    }
    const { productionUnits } = await this.listByCompaniesUseCase.execute(
      userId,
      companyIds,
    );
    return response.json({ status: 'success', data: { productionUnits } });
  }

  async extractFromFile(request: Request, response: Response): Promise<Response> {
    requireAuthenticatedUserId(request);
    return this.extractionController.extract(request, response);
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { productionUnits } = request.body as { productionUnits: ProductionUnitBulkInput[] };
    const normalizedProductionUnits = normalizeBulkProductionUnits(productionUnits);
    for (const unit of normalizedProductionUnits) {
      await this.assertAllocationAccess(userId, unit.allocations);
    }
    const { productionUnits: created, count } = await this.createBulkUseCase.execute({
      productionUnits: normalizedProductionUnits,
    });
    return response
      .status(201)
      .json({ status: 'success', data: { productionUnits: created, count } });
  }

  async updateBulk(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { productionUnits } = request.body as {
      productionUnits: Array<{ id: string } & Partial<ProductionUnit>>;
    };
    if (!Array.isArray(productionUnits) || productionUnits.length === 0) {
      throw AppError.badRequest('Missing productionUnits array', 'MISSING_PRODUCTION_UNITS');
    }
    const invalidIndex = productionUnits.findIndex((pu) => !pu.id);
    if (invalidIndex !== -1) {
      throw AppError.badRequest(
        `Missing id in productionUnits[${invalidIndex}]`,
        'MISSING_PRODUCTION_UNIT_ID',
      );
    }
    await this.accessGuard.assertProductionUnits(
      userId,
      productionUnits.map((unit) => unit.id),
    );
    const updates = productionUnits.map((pu) => {
      const { id, ...data } = pu;
      return { id, data };
    });
    try {
      const count = await this.repository.updateMany(updates);
      return response.json({ status: 'success', data: { count } });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw AppError.notFound(error.message, 'PRODUCTION_UNIT_NOT_FOUND');
        }
        if (error.message.includes('Invalid date format')) {
          throw AppError.badRequest(error.message, 'INVALID_DATE_FORMAT');
        }
      }
      throw error;
    }
  }

  async deleteBulk(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { ids } = request.body as {
      ids: string[];
    };
    if (!Array.isArray(ids) || ids.length === 0) {
      throw AppError.badRequest('Missing ids array', 'MISSING_IDS');
    }
    await this.accessGuard.assertProductionUnits(userId, ids);
    await this.deleteBulkUseCase.execute({ ids });
    return response.status(204).send();
  }

}
