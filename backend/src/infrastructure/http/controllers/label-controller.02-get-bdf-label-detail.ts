import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { GetBdfLabelDetailUseCase } from '../../../application/use-cases/label/GetBdfLabelDetailUseCase';
import { CsvBdfLabelDatasetRepository } from '../../repositories/CsvBdfLabelDatasetRepository';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerGetBdfLabelDetail(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { productName, registrationNumber } = request.query as {
      productName?: string;
      registrationNumber?: string;
    };
    const safeProductName = String(productName ?? '').trim();
    const safeRegistrationNumber = String(registrationNumber ?? '').trim();
    if (!safeProductName || !safeRegistrationNumber) {
      throw AppError.badRequest('Missing productName or registrationNumber', 'MISSING_FIELDS');
    }
    const repository = new CsvBdfLabelDatasetRepository();
    const useCase = new GetBdfLabelDetailUseCase(repository);
    const detail = await useCase.execute({
      productName: safeProductName,
      registrationNumber: safeRegistrationNumber,
    });
    if (!detail) {
      throw AppError.notFound('Label not found in BDF dataset', 'BDF_LABEL_NOT_FOUND');
    }
    return response.json({
      status: 'success',
      data: {
        id: detail.id,
        productName: detail.productName,
        registrationNumber: detail.registrationNumber,
        sourceUrl: detail.sourceUrl,
        label: detail.label,
        rawText: detail.rawText,
        extractionConfidence: detail.extractionConfidence,
        isVerified: false,
        extractedFields: detail.extractedFields,
        errors: detail.errors,
        qualityExtraction: detail.qualityExtraction,
        createdAt: detail.lastUpdate,
        updatedAt: detail.lastUpdate,
      },
    });
  }
