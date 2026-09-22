import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { GetLabelHistoryUseCase } from '../../../application/use-cases/label/GetLabelHistoryUseCase';
import { PrismaLabelHistoryRepository } from '../../repositories/PrismaLabelHistoryRepository';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerGetLabelHistory(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const historyRepo = new PrismaLabelHistoryRepository(prisma);
    const useCase = new GetLabelHistoryUseCase(historyRepo);
    const history = await useCase.execute({ labelExtractionId: safeId });
    return response.json({ status: 'success', data: history });
  }
