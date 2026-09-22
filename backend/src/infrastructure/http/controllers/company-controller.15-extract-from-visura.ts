import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerExtractFromVisura(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    const isPdf =
      file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw AppError.badRequest('Only PDF files are supported for visura', 'INVALID_FILE_TYPE');
    }

    try {
      const extracted = await this.getVisuraCameraleAgent().extractFromPdf(file.buffer);
      return response.json({ status: 'success', data: { extracted } });
    } catch (error) {
      console.error('Error during visura extraction:', error);
      if (error instanceof AppError) throw error;
      throw AppError.internal('Visura extraction failed', 'VISURA_EXTRACTION_FAILED');
    }
  }
