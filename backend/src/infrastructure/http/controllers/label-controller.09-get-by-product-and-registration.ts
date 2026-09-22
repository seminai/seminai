import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { GetLabelByProductAndRegistrationUseCase } from '../../../application/use-cases/label/GetLabelByProductAndRegistrationUseCase';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerGetByProductAndRegistration(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const { name, regNumber } = request.query as { name?: string; regNumber?: string };
    const safeProductName = String(name ?? '').trim();
    const safeRegistrationNumber = String(regNumber ?? '').trim();
    if (!safeProductName || !safeRegistrationNumber) {
      throw AppError.badRequest('Missing name or regNumber', 'MISSING_FIELDS');
    }
    const repo = new PrismaLabelExtractionRepository(prisma);
    const useCase = new GetLabelByProductAndRegistrationUseCase(repo);
    const found = await useCase.execute({
      productName: safeProductName,
      registrationNumber: safeRegistrationNumber,
    });
    if (!found) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    return response.json({ status: 'success', data: found });
  }
