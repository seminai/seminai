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
import { ProductionUnitCsvAgent } from '../../services/agents/production_unit/production_unit_csv_agent';
import { PianoColturalePdfAgent } from '../../services/agents/file_agent/piano_colturale_pdf_agent';
import {
  buildFieldIndex,
  buildProductionUnitPreview,
  getCropCatalog,
} from '../../services/extraction/production-unit-normalizer';

type ProductionUnitBulkInput = {
  name: string;
  cropName: string;
  cropType: string;
  variety: string;
  protocoll: string;
  allocations: Array<{ fieldId: string; areaHa: number }>;
  protectionStructure: string;
  areaHa?: number;
  startDate: unknown;
  floweringDate: unknown;
  harvestingDate: unknown;
  endDate: unknown;
  occupazione?: string | null;
  destinazioneDiUso?: string | null;
  acquaTotalePeridoL?: number | null;
};

type NormalizedProductionUnitBulk = {
  name: string;
  cropName: string;
  cropType: string;
  variety: string;
  protocoll: string;
  allocations: Array<{ fieldId: string; areaHa: number }>;
  protectionStructure: string;
  areaHa?: number;
  startDate: Date | null;
  floweringDate: Date | null;
  harvestingDate: Date | null;
  endDate: Date | null;
  occupazione?: string | null;
  destinazioneDiUso?: string | null;
  acquaTotalePeridoL?: number | null;
};

export class ProductionUnitController {
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
  ) {}

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
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
    const userId = this.requireUser(request);
    const body = request.body as Parameters<CreateProductionUnitUseCase['execute']>[0];
    await this.assertAllocationAccess(userId, body.allocations ?? []);
    const { productionUnit } = await this.createUseCase.execute(body);
    return response.status(201).json({ status: 'success', data: { productionUnit } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
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
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.accessGuard.assertProductionUnit(userId, id);
    await this.deleteUseCase.execute(id);
    return response.status(204).send();
  }

  async listByField(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { fieldId } = request.params;
    const list = await this.repository.findManyByFieldId(fieldId);
    return response.json({ status: 'success', data: { productionUnits: list } });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const productionUnit = await this.accessGuard.assertProductionUnit(userId, id);
    const fieldIds = await this.repository.listFieldIdsByProductionUnit(id);
    return response.json({ status: 'success', data: { productionUnit, fieldIds } });
  }

  async listByUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { productionUnits } = await this.listByUserUseCase.execute(request.user.id);
    return response.json({ status: 'success', data: { productionUnits } });
  }

  async listByCrop(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { cropName } = request.query;
    if (!cropName || typeof cropName !== 'string') {
      throw AppError.badRequest('Missing or invalid cropName parameter', 'MISSING_CROP_NAME');
    }
    const { productionUnits } = await this.listByCropUseCase.execute(request.user.id, cropName);
    return response.json({ status: 'success', data: { productionUnits } });
  }

  async listByCompanies(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { companyIds } = request.body as { companyIds?: string[] };
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      throw AppError.badRequest('Missing or invalid companyIds array', 'MISSING_COMPANY_IDS');
    }
    const { productionUnits } = await this.listByCompaniesUseCase.execute(
      request.user.id,
      companyIds,
    );
    return response.json({ status: 'success', data: { productionUnits } });
  }

  async extractFromFile(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }
    const companyId = this.resolveCompanyId(request);
    if (!companyId) {
      throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    }

    if (this.isPdfFile(file)) {
      return this.extractFromPdfWithProgress(file, companyId, response);
    }

    const csvAgent = new ProductionUnitCsvAgent();
    const result = await csvAgent.extractProductionUnitsFromCsv(file.buffer);
    const productionUnits = await this.buildPreviewsAsync(result.units, companyId);
    return response.json({
      status: 'success',
      data: {
        productionUnits,
        extractedCount: productionUnits.length,
        diagnostics: result.diagnostics,
      },
    });
  }

  private async extractFromPdfWithProgress(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    companyId: string,
    response: Response,
  ): Promise<Response> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const sendEvent = (payload: Record<string, unknown>): void => {
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const pdfAgent = new PianoColturalePdfAgent();
      const result = await pdfAgent.extractFromPdf(file.buffer, (completed, total) => {
        sendEvent({
          type: 'progress',
          completed,
          total,
          progress: Math.round(((completed + 1) / total) * 100),
        });
      });

      const productionUnits = await this.buildPreviewsAsync(
        result.productionUnits.units,
        companyId,
      );
      sendEvent({
        type: 'result',
        data: {
          productionUnits,
          extractedCount: productionUnits.length,
          diagnostics: result.productionUnits.diagnostics,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore durante estrazione PDF';
      sendEvent({ type: 'error', message });
    }

    response.end();
    return response;
  }

  private isPdfFile(file: { mimetype: string; originalname: string }): boolean {
    return file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
  }

  private async buildPreviewsAsync(
    rawUnits: import('../../services/agents/production_unit/production_unit_csv_agent').ProductionUnitRaw[],
    companyId: string,
  ) {
    const companyFields = await this.fieldRepository.findManyByCompanyId(companyId);
    const fieldIdx = buildFieldIndex(companyFields);
    const cropCatalog = getCropCatalog();
    return rawUnits.map((unit) =>
      buildProductionUnitPreview(unit, companyId, fieldIdx, cropCatalog),
    );
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { productionUnits } = request.body as { productionUnits: ProductionUnitBulkInput[] };
    const normalizedProductionUnits = this.normalizeBulkProductionUnits(productionUnits);
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
    const userId = this.requireUser(request);
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
    const userId = this.requireUser(request);
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

  private normalizeBulkProductionUnits(
    units: ProductionUnitBulkInput[],
  ): NormalizedProductionUnitBulk[] {
    if (!Array.isArray(units)) {
      throw AppError.badRequest('Missing productionUnits array', 'MISSING_PRODUCTION_UNITS');
    }
    return units.map((unit, index) => ({
      ...unit,
      startDate: this.parseDateNullable(unit.startDate, `productionUnits[${index}].startDate`),
      floweringDate: this.parseDateNullable(
        unit.floweringDate,
        `productionUnits[${index}].floweringDate`,
      ),
      harvestingDate: this.parseDateNullable(
        unit.harvestingDate,
        `productionUnits[${index}].harvestingDate`,
      ),
      endDate: this.parseDateNullable(unit.endDate, `productionUnits[${index}].endDate`),
    }));
  }

  private parseDateNullable(value: unknown, fieldName: string): Date | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    throw AppError.badRequest(`Invalid date format for ${fieldName}`, 'INVALID_DATE_FORMAT');
  }

  private resolveCompanyId(request: Request): string | null {
    const bodyCompanyId = (request.body as { companyId?: string })?.companyId;
    if (typeof bodyCompanyId === 'string' && bodyCompanyId.trim().length > 0) {
      return bodyCompanyId;
    }
    const queryCompanyId = request.query.companyId;
    if (typeof queryCompanyId === 'string' && queryCompanyId.trim().length > 0) {
      return queryCompanyId;
    }
    return null;
  }
}
