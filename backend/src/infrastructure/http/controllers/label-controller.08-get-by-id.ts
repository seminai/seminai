import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerGetById(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const repo = new PrismaLabelExtractionRepository(prisma);
    const found = await repo.findById(safeId);
    if (!found) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    return response.json({ status: 'success', data: found });
  }
