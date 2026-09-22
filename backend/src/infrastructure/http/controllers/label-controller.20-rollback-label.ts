import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { RollbackLabelUseCase } from '../../../application/use-cases/label/RollbackLabelUseCase';
import { PrismaLabelHistoryRepository } from '../../repositories/PrismaLabelHistoryRepository';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerRollbackLabel(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { historyId } = request.params as { historyId?: string };
    const safeHistoryId = String(historyId ?? '').trim();
    if (!safeHistoryId) {
      throw AppError.badRequest('Missing historyId', 'MISSING_HISTORY_ID');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    if (!userId) {
      throw AppError.unauthorized('User ID non disponibile', 'MISSING_USER_ID');
    }
    const repo = new PrismaLabelExtractionRepository(prisma);
    const historyRepo = new PrismaLabelHistoryRepository(prisma);
    const useCase = new RollbackLabelUseCase(repo, historyRepo);
    const restored = await useCase.execute({
      historyEntryId: safeHistoryId,
      userId,
    });
    if (!restored) {
      throw AppError.notFound('History entry or label not found', 'NOT_FOUND');
    }
    return response.json({ status: 'success', data: restored });
  }
