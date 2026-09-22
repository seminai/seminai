import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { Field } from '../../../domain/entities/Field';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import {
  ExtractFromFileUseCase,
  type FieldPreview,
  type ProductionUnitPreview,
} from '../../../application/use-cases/onboarding/ExtractFromFileUseCase';
import { getOnboardingExtractionQueue } from '../../queue/OnboardingExtractionQueue';
import {
  predictPhenologyDates,
  type PhenologyPredictionInput,
} from '../../services/phenology/phenologyDatePredictor';

interface BulkCreateBody {
  companyId: string;
  fields: FieldPreview[];
  productionUnits: ProductionUnitPreview[];
}

export class OnboardingController {
  constructor(
    private readonly fieldRepository: IFieldRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
  ) {}

  /**
   * POST /onboarding/extract
   * Accepts a CSV/Excel/PDF file and extracts both fields and production units (sync).
   */
  async extractFromFile(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }
    const useCase = new ExtractFromFileUseCase();
    const result = await useCase.execute({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
    return response.json({ status: 'success', data: result });
  }

  /**
   * POST /onboarding/extract/start
   * Accepts a file and starts an async extraction job. Returns jobId immediately.
   */
  async startExtractJob(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }
    const queue = getOnboardingExtractionQueue();
    const jobId = await queue.addJob({
      fileBuffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      userId: request.user.id,
    });
    return response.status(202).json({ status: 'accepted', data: { jobId } });
  }

  /**
   * GET /onboarding/extract/status/:jobId
   */
  async getExtractJobStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { jobId } = request.params;
    if (!jobId) {
      throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    }
    const queue = getOnboardingExtractionQueue();
    const status = await queue.getJobStatus(jobId);
    if (status.data?.userId && status.data.userId !== request.user.id) {
      throw AppError.forbidden('Not authorized for this job', 'FORBIDDEN');
    }
    return response.json({ status: 'success', data: status });
  }

  /**
   * GET /onboarding/extract/result/:jobId
   */
  async getExtractJobResult(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { jobId } = request.params;
    if (!jobId) {
      throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    }
    const queue = getOnboardingExtractionQueue();
    const status = await queue.getJobStatus(jobId);
    if (status.data?.userId && status.data.userId !== request.user.id) {
      throw AppError.forbidden('Not authorized for this job', 'FORBIDDEN');
    }
    if (status.state !== 'completed') {
      throw AppError.badRequest(`Job is not completed (state: ${status.state})`, 'JOB_NOT_READY');
    }
    return response.json({ status: 'success', data: status.result });
  }

  /**
   * DELETE /onboarding/extract/:jobId
   */
  async cancelExtractJob(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { jobId } = request.params;
    if (!jobId) {
      throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    }
    const queue = getOnboardingExtractionQueue();
    const status = await queue.getJobStatus(jobId);
    if (status.data?.userId && status.data.userId !== request.user.id) {
      throw AppError.forbidden('Not authorized for this job', 'FORBIDDEN');
    }
    const result = await queue.cancelJob(jobId);
    return response.json({ status: 'success', data: result });
  }

  /**
   * POST /onboarding/bulk-create
   * Accepts the extract output (possibly modified) and saves fields + production units to DB.
   */
  async bulkCreateFieldsAndProductionUnits(
    request: Request,
    response: Response,
  ): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const body = request.body as BulkCreateBody;

    if (!body.companyId) {
      throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    }

    if (!Array.isArray(body.fields) && !Array.isArray(body.productionUnits)) {
      throw AppError.badRequest(
        'Either fields or productionUnits must be provided',
        'MISSING_DATA',
      );
    }

    const fieldsInput = body.fields ?? [];
    const productionUnitsInput = body.productionUnits ?? [];

    // Step 1: Validate fields have minimal required data (name required; cadastral data optional)
    for (let i = 0; i < fieldsInput.length; i++) {
      const f = fieldsInput[i];
      if (!f.name && !f.foglio && !f.particella) {
        throw AppError.badRequest(
          `Field at index ${i} is missing both name and cadastral references`,
          'INVALID_FIELD_DATA',
        );
      }
    }

    // Step 2: Create and upsert Field entities
    const fieldEntities = fieldsInput.map((f, idx) => {
      const hasCadastral = f.foglio && f.particella;
      const name = f.name || (hasCadastral ? `F${f.foglio} P${f.particella}` : `Campo ${idx + 1}`);
      return Field.create({
        companyId: body.companyId,
        sourceFileId: f.sourceFileId ?? null,
        name,
        coordinates: f.coordinates ?? [],
        coordinatesGaussBoaga: f.coordinatesGaussBoaga ?? [],
        latitude: f.latitude ?? null,
        longitude: f.longitude ?? null,
        polygon: f.polygon ?? null,
        polygonGaussBoaga: f.polygonGaussBoaga ?? null,
        gisHa: f.gisHa ?? null,
        sauHa: f.sauHa ?? null,
        ph: f.ph ?? null,
        nitrogen: f.nitrogen ?? null,
        phosphorus: f.phosphorus ?? null,
        potassium: f.potassium ?? null,
        calcium: f.calcium ?? null,
        magnesium: f.magnesium ?? null,
        soilType: f.soilType ?? null,
        uso: f.uso ?? null,
        qualita: f.qualita ?? null,
        superficieCatastaleMq: f.superficieCatastaleMq ?? null,
        sezione: f.sezione ?? null,
        foglio: f.foglio ?? null,
        particella: f.particella ?? null,
        subalterno: f.subalterno ?? null,
        nation: f.nation ?? 'IT',
        region: f.region ?? null,
        city: f.city ?? null,
        address: f.address ?? f.city ?? null,
        cap: f.cap ?? null,
        variazioneMq: f.variazioneMq ?? null,
        inizioConduzione: f.inizioConduzione ? new Date(f.inizioConduzione) : null,
        fineConduzione: f.fineConduzione ? new Date(f.fineConduzione) : null,
        bufferZoneNotes: null,
      });
    });

    const upsertedFields = await this.fieldRepository.upsertMany(fieldEntities);

    // Step 3: Build field index by cadastral reference for allocation matching
    const fieldIndex = new Map<string, { id: string; name: string }>();
    for (const field of upsertedFields) {
      const keys: string[] = [field.name];
      if (field.foglio && field.particella) {
        keys.push(
          `${field.foglio}_${field.particella}`,
          `${field.sezione || ''}_${field.foglio}_${field.particella}`,
          `${field.sezione || ''}_${field.foglio}_${field.particella}_${field.subalterno || ''}`,
        );
      }
      for (const key of keys) {
        fieldIndex.set(key.toLowerCase(), { id: field.id, name: field.name });
      }
    }

    // Step 4: Create production units with allocations
    const productionUnitEntities: Array<{
      productionUnit: ProductionUnit;
      allocations: Array<{ fieldId: string; areaHaOnField: number }>;
    }> = [];

    for (const pu of productionUnitsInput) {
      const primaryCycle = pu.cycles?.[0];
      const totalAreaHa =
        pu.areaHa ?? pu.fieldAllocations?.reduce((sum, a) => sum + (a.areaHa ?? 0), 0) ?? 0;

      const productionUnit = ProductionUnit.create({
        name: pu.name || 'Unità produttiva',
        cropName: pu.cropName || primaryCycle?.cropName || '',
        cropType: pu.cropType || primaryCycle?.cropType || '',
        variety: pu.variety || primaryCycle?.variety || '',
        protocoll: pu.protocoll || '',
        areaHa: totalAreaHa,
        protectionStructure: pu.protectionStructure || primaryCycle?.protectionStructure || '',
        startDate: pu.startDate ? new Date(pu.startDate) : null,
        floweringDate: pu.floweringDate ? new Date(pu.floweringDate) : null,
        harvestingDate: pu.harvestingDate ? new Date(pu.harvestingDate) : null,
        endDate: pu.endDate ? new Date(pu.endDate) : null,
        occupazione: pu.occupazione ?? null,
        destinazioneDiUso: pu.destinazioneDiUso ?? null,
        acquaTotalePeridoL: 0,
      });

      // Resolve allocations to field IDs
      const allocations: Array<{ fieldId: string; areaHaOnField: number }> = [];

      if (pu.fieldAllocations && pu.fieldAllocations.length > 0) {
        for (const alloc of pu.fieldAllocations) {
          const field = this.resolveFieldFromAllocation(alloc, fieldIndex);
          if (field) {
            allocations.push({
              fieldId: field.id,
              areaHaOnField: alloc.areaHa,
            });
          }
        }
      }

      productionUnitEntities.push({ productionUnit, allocations });
    }

    const createdProductionUnits =
      await this.productionUnitRepository.createBulk(productionUnitEntities);

    return response.status(201).json({
      status: 'success',
      data: {
        fields: upsertedFields,
        productionUnits: createdProductionUnits,
        fieldCount: upsertedFields.length,
        productionUnitCount: createdProductionUnits.length,
      },
    });
  }

  /**
   * POST /onboarding/predict-phenology
   * Predicts flowering/harvesting dates for production units with missing dates.
   */
  async predictPhenology(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const body = request.body as {
      productionUnits: PhenologyPredictionInput[];
    };

    if (!Array.isArray(body.productionUnits) || body.productionUnits.length === 0) {
      throw AppError.badRequest(
        'productionUnits array is required and must not be empty',
        'MISSING_PRODUCTION_UNITS',
      );
    }

    // Validate each entry has a cropName
    for (const pu of body.productionUnits) {
      if (!pu.cropName?.trim()) {
        throw AppError.badRequest(
          `Production unit at index ${pu.index} is missing cropName`,
          'MISSING_CROP_NAME',
        );
      }
    }

    const predictions = await predictPhenologyDates(body.productionUnits, request.user.id);

    return response.json({
      status: 'success',
      data: { predictions },
    });
  }

  /**
   * Try to find a field from the index using the allocation's cadastral reference.
   */
  private resolveFieldFromAllocation(
    alloc: {
      fieldName: string;
      sezione: string | null;
      foglio: string | null;
      particella: string | null;
      subalterno: string | null;
    },
    fieldIndex: Map<string, { id: string; name: string }>,
  ): { id: string; name: string } | null {
    if (!alloc.foglio || !alloc.particella) return null;
    const keys = [
      `${alloc.sezione || ''}_${alloc.foglio}_${alloc.particella}_${alloc.subalterno || ''}`,
      `${alloc.sezione || ''}_${alloc.foglio}_${alloc.particella}`,
      `${alloc.foglio}_${alloc.particella}`,
      alloc.fieldName,
    ];
    for (const key of keys) {
      const found = fieldIndex.get(key.toLowerCase());
      if (found) return found;
    }
    return null;
  }
}
