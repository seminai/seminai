import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { VerifyLabelUseCase } from '../../../application/use-cases/label/VerifyLabelUseCase';
import { PrismaLabelHistoryRepository } from '../../repositories/PrismaLabelHistoryRepository';
import { createLabelSnapshot } from '../../../domain/utils/labelDiff';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerVerifyLabel(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    const body = request.body as { isVerified?: boolean };
    if (typeof body.isVerified !== 'boolean') {
      throw AppError.badRequest('Missing or invalid isVerified field', 'INVALID_IS_VERIFIED');
    }
    const repo = new PrismaLabelExtractionRepository(prisma);
    const existing = await repo.findById(safeId);
    const useCase = new VerifyLabelUseCase(repo);
    const updated = await useCase.execute({
      id: safeId,
      isVerified: body.isVerified,
    });
    if (!updated) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (userId && existing && existing.isVerified !== body.isVerified) {
      const historyRepo = new PrismaLabelHistoryRepository(prisma);
      const snapshot = createLabelSnapshot(existing);
      await historyRepo.create({
        labelExtractionId: safeId,
        userId,
        changes: [
          { field: 'isVerified', oldValue: existing.isVerified, newValue: body.isVerified },
        ],
        previousSnapshot: snapshot,
      });
    }
    return response.json({ status: 'success', data: updated });
  }
