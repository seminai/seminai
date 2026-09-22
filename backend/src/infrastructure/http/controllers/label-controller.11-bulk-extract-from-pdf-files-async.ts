import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { getLabelExtractionQueue } from '../../queue/LabelExtractionQueue';
import { MulterFile } from '../../services/Multer';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerBulkExtractFromPdfFilesAsync(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const files = (request as Request & { files?: MulterFile[] }).files ?? [];
    if (files.length === 0) {
      throw AppError.badRequest('Nessun file PDF caricato', 'MISSING_FILES');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    if (!userId) {
      throw AppError.unauthorized('User ID non disponibile', 'MISSING_USER_ID');
    }
    const userRepository = new PrismaUserRepository(prisma);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    if (user.credits <= 0) {
      throw AppError.badRequest(
        `Insufficient credits. Available: ${user.credits}. Please recharge your account.`,
        'INSUFFICIENT_CREDITS',
      );
    }
    const concurrency = parseInt(String(request.body.concurrency ?? '5'), 10);
    const fileInputs = files.map((file) => ({
      fileName: file.originalname,
      pdfBuffer: file.buffer,
    }));
    const queue = getLabelExtractionQueue();
    const jobId = await queue.addJob({
      files: fileInputs,
      userId,
      concurrency,
    });
    return response.json({
      status: 'success',
      data: {
        jobId,
        message: 'Job created successfully. Use /labels/job-status/:jobId to check progress',
      },
    });
  }
