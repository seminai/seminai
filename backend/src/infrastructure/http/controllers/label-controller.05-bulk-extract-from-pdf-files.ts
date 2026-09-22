import type { Request, Response } from 'express';
import { GetLabelTextFromUrlProvider } from '../../services/tool/getLabelTextFromUrl.provider';
import { ExtractLabelAdapter } from '../../services/tool/extractLabel.adapter';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { BulkExtractLabelsFromPdfFilesUseCase } from '../../../application/use-cases/label/BulkExtractLabelsFromPdfFilesUseCase';
import { FileUploadAdapter } from '../../services/tool/fileUpload.adapter';
import { CostCalculator, LangChainUsageCollector, OpenAiPricingRegistry, UsageAccumulator } from '../../services/llm_costs/usage';
import { MulterFile } from '../../services/Multer';
import { LlmJobType } from '@prisma/client';
import type { LabelControllerContext } from './label-controller.context';

export async function labelControllerBulkExtractFromPdfFiles(this: LabelControllerContext, request: Request, response: Response): Promise<Response> {
    const files = (request as Request & { files?: MulterFile[] }).files ?? [];
    if (files.length === 0) {
      throw AppError.badRequest('Nessun file PDF caricato', 'MISSING_FILES');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    if (!userId) {
      throw AppError.unauthorized('User ID non disponibile', 'MISSING_USER_ID');
    }
    const concurrency = parseInt(String(request.body.concurrency ?? '5'), 10);
    const repo = new PrismaLabelExtractionRepository(prisma);
    const textProvider = new GetLabelTextFromUrlProvider();
    const extractor = new ExtractLabelAdapter();
    const fileService = new FileUploadAdapter();
    const useCase = new BulkExtractLabelsFromPdfFilesUseCase(
      repo,
      textProvider,
      extractor,
      fileService,
    );
    const fileInputs = files.map((file) => ({
      fileName: file.originalname,
      pdfBuffer: file.buffer,
    }));
    const usage = new UsageAccumulator();
    const collector = new LangChainUsageCollector(usage);
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const pricing = OpenAiPricingRegistry.getPricing(model);
    const outcome = await useCase.execute({
      files: fileInputs,
      userId,
      concurrency,
      callbacks: [collector],
      usageAccumulator: usage,
      context: {
        userId,
        jobId: 'sync-bulk-pdf',
        jobGroupId: 'sync-bulk-pdf',
        jobType: LlmJobType.LABEL,
      },
    });
    const tokens = usage.getTotals();
    const mistralOcrPages = usage.getMistralOcrPages();
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      mistralOcrPages,
      margin: 0.2,
    });
    return response.json({ status: 'success', data: outcome, cost });
  }
