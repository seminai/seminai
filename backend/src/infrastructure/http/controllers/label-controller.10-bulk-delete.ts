import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerBulkDelete(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const body = request.body as { ids?: unknown };
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const normalizedIds: string[] = ids
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.length > 0);
    if (normalizedIds.length === 0) {
      throw AppError.badRequest('Body malformato: ids[] richiesto', 'MISSING_IDS');
    }
    const repo = new PrismaLabelExtractionRepository(prisma);
    const deleted = await repo.deleteManyByIds(normalizedIds);
    return response.json({ status: 'success', data: { deleted } });
  }
