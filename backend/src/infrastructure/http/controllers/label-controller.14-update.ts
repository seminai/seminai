import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { UpdateLabelUseCase } from '../../../application/use-cases/label/UpdateLabelUseCase';
import { PrismaLabelHistoryRepository } from '../../repositories/PrismaLabelHistoryRepository';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerUpdate(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    const body = request.body;
    const repo = new PrismaLabelExtractionRepository(prisma);
    const historyRepo = new PrismaLabelHistoryRepository(prisma);
    const useCase = new UpdateLabelUseCase(repo, historyRepo);
    const updated = await useCase.execute({
      id: safeId,
      userId,
      ...body,
    });
    if (!updated) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    return response.json({ status: 'success', data: updated });
  }
