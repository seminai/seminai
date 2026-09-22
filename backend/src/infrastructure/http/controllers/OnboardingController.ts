import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { ExtractFromFileUseCase } from '../../../application/use-cases/onboarding/ExtractFromFileUseCase';
import {
  BulkCreateOnboardingDataUseCase,
  type BulkCreateOnboardingDataInput,
} from '../../../application/use-cases/onboarding/BulkCreateOnboardingDataUseCase';
import { getOnboardingExtractionQueue } from '../../queue/OnboardingExtractionQueue';
import {
  predictPhenologyDates,
  type PhenologyPredictionInput,
} from '../../services/phenology/phenologyDatePredictor';

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

    const result = await new BulkCreateOnboardingDataUseCase(
      this.fieldRepository,
      this.productionUnitRepository,
    ).execute(request.body as BulkCreateOnboardingDataInput);

    return response.status(201).json({
      status: 'success',
      data: {
        fields: result.fields,
        productionUnits: result.productionUnits,
        fieldCount: result.fields.length,
        productionUnitCount: result.productionUnits.length,
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
}
