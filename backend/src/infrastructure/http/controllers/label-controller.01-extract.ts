import type { Request, Response } from 'express';

import { ExtractLabelUseCase } from '../../../application/use-cases/label/ExtractLabelUseCase';
import { GetLabelTextProvider } from '../../services/tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../services/tool/extractLabel.adapter';
import { AppError } from '../../../domain/errors/AppError';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerExtract(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { name, regNumber } = request.query as { name?: string; regNumber?: string };
    if (!name || !regNumber) {
      throw AppError.badRequest('Missing name or regNumber', 'MISSING_FIELDS');
    }

    const useCase = new ExtractLabelUseCase(new GetLabelTextProvider(), new ExtractLabelAdapter());
    const result = await useCase.execute({ name, registrationNumber: regNumber });
    if (!result) {
      throw AppError.notFound('Label not found or text not extractable', 'LABEL_NOT_FOUND');
    }
    return response.json({
      status: 'success',
      data: { url: result.url, label: result.data, text: result.text },
    });
  }
