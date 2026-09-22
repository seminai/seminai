import type { Request, Response } from 'express';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerListSummary(this: LabelControllerContext, _request: Request, response: Response): Promise<Response> {
    const repo = new PrismaLabelExtractionRepository(prisma);
    const all = await repo.listAll();
    const summary = all.map((rec) => ({
      id: rec.id,
      productName: rec.productName,
      registrationNumber: rec.registrationNumber,
      category: rec.category,
      extractionConfidence: rec.extractionConfidence,
      isVerified: rec.isVerified,
      qualityExtraction: rec.qualityExtraction,
      errors: rec.errors,
      createdAt: rec.createdAt,
    }));
    return response.json({ status: 'success', data: summary });
  }
