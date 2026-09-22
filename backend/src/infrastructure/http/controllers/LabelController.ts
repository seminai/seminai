import type { Request, Response } from 'express';

import { ExtractLabelUseCase } from '../../../application/use-cases/label/ExtractLabelUseCase';
import { GetLabelTextProvider } from '../../services/tool/getLabelText.provider';
import { GetLabelTextFromUrlProvider } from '../../services/tool/getLabelTextFromUrl.provider';
import { ExtractLabelAdapter } from '../../services/tool/extractLabel.adapter';
import { isFitoLabel, isUsableLabel, Label } from '../../../domain/dtos/label.dto';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { BulkExtractLabelsUseCase } from '../../../application/use-cases/label/BulkExtractLabelsUseCase';
import { BulkExtractLabelsFromPdfFilesUseCase } from '../../../application/use-cases/label/BulkExtractLabelsFromPdfFilesUseCase';
import { FileUploadAdapter } from '../../services/tool/fileUpload.adapter';
import { getLabelExtractionQueue } from '../../queue/LabelExtractionQueue';
import { getFertilizerLabelExtractionQueue } from '../../queue/FertilizerLabelExtractionQueue';
import { serializeCsv, toCsvRows } from '../../utils/labelsCsv';
import * as fs from 'fs';
import * as path from 'path';
import {
  CostCalculator,
  LangChainUsageCollector,
  OpenAiPricingRegistry,
  UsageAccumulator,
} from '../../services/llm_costs/usage';
import { UpdateLabelUseCase } from '../../../application/use-cases/label/UpdateLabelUseCase';
import { VerifyLabelUseCase } from '../../../application/use-cases/label/VerifyLabelUseCase';
import { GetLabelHistoryUseCase } from '../../../application/use-cases/label/GetLabelHistoryUseCase';
import { RollbackLabelUseCase } from '../../../application/use-cases/label/RollbackLabelUseCase';
import { PrismaLabelHistoryRepository } from '../../repositories/PrismaLabelHistoryRepository';
import { calculateLabelChanges, createLabelSnapshot } from '../../../domain/utils/labelDiff';
import { GetBdfLabelDetailUseCase } from '../../../application/use-cases/label/GetBdfLabelDetailUseCase';
import { ListBdfLabelDatasetPairsUseCase } from '../../../application/use-cases/label/ListBdfLabelDatasetPairsUseCase';
import { CsvBdfLabelDatasetRepository } from '../../repositories/CsvBdfLabelDatasetRepository';
import { MulterFile } from '../../services/Multer';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { GetLabelByProductAndRegistrationUseCase } from '../../../application/use-cases/label/GetLabelByProductAndRegistrationUseCase';
import {
  extractStructuredTreatmentData,
  extractStructuredTreatmentDataWithMistral,
} from '../../services/tool/extractDataFromLabel';
import { enhanceRawTextWithGptVision } from '../../services/ocr/gptVision';
import { LabelCategory } from '../../../domain/repositories/ILabelExtractionRepository';
import { LlmJobType } from '@prisma/client';

export class LabelController {
  async extract(request: Request, response: Response): Promise<Response> {
    const { name, regNumber } = request.query as { name?: string; regNumber?: string };
    if (!name || !regNumber) {
      throw AppError.badRequest('Missing name or regNumber', 'MISSING_FIELDS');
    }

    const useCase = new ExtractLabelUseCase(new GetLabelTextProvider(), new ExtractLabelAdapter());
    const result = await useCase.execute({ name, registrationNumber: regNumber });
    if (!result) {
      throw AppError.notFound('Label not found or text not extractable', 'LABEL_NOT_FOUND');
    }
    return response.json({
      status: 'success',
      data: { url: result.url, label: result.data, text: result.text },
    });
  }

  async getBdfLabelDetail(request: Request, response: Response): Promise<Response> {
    const { productName, registrationNumber } = request.query as {
      productName?: string;
      registrationNumber?: string;
    };
    const safeProductName = String(productName ?? '').trim();
    const safeRegistrationNumber = String(registrationNumber ?? '').trim();
    if (!safeProductName || !safeRegistrationNumber) {
      throw AppError.badRequest('Missing productName or registrationNumber', 'MISSING_FIELDS');
    }
    const repository = new CsvBdfLabelDatasetRepository();
    const useCase = new GetBdfLabelDetailUseCase(repository);
    const detail = await useCase.execute({
      productName: safeProductName,
      registrationNumber: safeRegistrationNumber,
    });
    if (!detail) {
      throw AppError.notFound('Label not found in BDF dataset', 'BDF_LABEL_NOT_FOUND');
    }
    return response.json({
      status: 'success',
      data: {
        id: detail.id,
        productName: detail.productName,
        registrationNumber: detail.registrationNumber,
        sourceUrl: detail.sourceUrl,
        label: detail.label,
        rawText: detail.rawText,
        extractionConfidence: detail.extractionConfidence,
        isVerified: false,
        extractedFields: detail.extractedFields,
        errors: detail.errors,
        qualityExtraction: detail.qualityExtraction,
        createdAt: detail.lastUpdate,
        updatedAt: detail.lastUpdate,
      },
    });
  }

  async listBdfLabelPairs(_request: Request, response: Response): Promise<Response> {
    const repository = new CsvBdfLabelDatasetRepository();
    const useCase = new ListBdfLabelDatasetPairsUseCase(repository);
    const pairs = await useCase.execute();
    return response.json({ status: 'success', data: pairs });
  }

  async bulkExtract(request: Request, response: Response): Promise<Response> {
    const body = request.body as {
      items?: Array<{ name?: string; regNumber?: string }>;
      concurrency?: number;
    };
    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      throw AppError.badRequest('Body malformato: items[] richiesto', 'MISSING_ITEMS');
    }

    const repo = new PrismaLabelExtractionRepository(prisma);
    const textProvider = new GetLabelTextProvider();
    const extractor = new ExtractLabelAdapter();
    const useCase = new BulkExtractLabelsUseCase(repo, textProvider, extractor);

    const normalized = items.map((it) => ({
      name: String(it?.name ?? '').trim(),
      regNumber: String(it?.regNumber ?? '').trim(),
    }));
    // Setup token usage tracking and pricing
    const usage = new UsageAccumulator();
    const collector = new LangChainUsageCollector(usage);
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const pricing = OpenAiPricingRegistry.getPricing(model);
    const outcome = await useCase.execute({
      items: normalized,
      concurrency: body?.concurrency,
      callbacks: [collector],
      usageAccumulator: usage,
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

  async bulkExtractFromPdfFiles(request: Request, response: Response): Promise<Response> {
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

  async exportCsv(_request: Request, response: Response): Promise<Response> {
    const repo = new PrismaLabelExtractionRepository(prisma);
    const all = await repo.listAll();

    const rows = all
      .filter((rec) => isFitoLabel(rec.label))
      .flatMap((rec) =>
        toCsvRows({
          productName: rec.productName,
          registrationNumber: rec.registrationNumber,
          label: rec.label as Label,
        }),
      );
    const csv = serializeCsv(rows);

    const baseDir = path.resolve(process.cwd(), 'extraction', 'label');
    fs.mkdirSync(baseDir, { recursive: true });
    const filename = `labels_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    const filePath = path.join(baseDir, filename);
    fs.writeFileSync(filePath, csv, { encoding: 'utf8' });

    return response.json({ status: 'success', data: { filePath } });
  }

  async listSummary(_request: Request, response: Response): Promise<Response> {
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

  async getById(request: Request, response: Response): Promise<Response> {
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

  async getByProductAndRegistration(request: Request, response: Response): Promise<Response> {
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

  async bulkDelete(request: Request, response: Response): Promise<Response> {
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

  async bulkExtractFromPdfFilesAsync(request: Request, response: Response): Promise<Response> {
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

  async bulkExtractFromPdfFilesFertilizerAsync(
    request: Request,
    response: Response,
  ): Promise<Response> {
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
    const queue = getFertilizerLabelExtractionQueue();
    const jobId = await queue.addJob({
      files: fileInputs,
      userId,
      concurrency,
    });
    return response.json({
      status: 'success',
      data: {
        jobId,
        message:
          'Job created successfully. Use /labels/job-status/:jobId (generic) or fertilizer specific endpoint if exists',
      },
    });
  }

  async getJobStatus(request: Request, response: Response): Promise<Response> {
    const { jobId } = request.params as { jobId?: string };
    if (!jobId) {
      throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    }
    // Check standard queue first
    const queue = getLabelExtractionQueue();
    try {
      const status = await queue.getJobStatus(jobId);
      return response.json({ status: 'success', data: status });
    } catch (error) {
      // If not found in standard queue, try fertilizer queue
      const fertilizerQueue = getFertilizerLabelExtractionQueue();
      try {
        const status = await fertilizerQueue.getJobStatus(jobId);
        return response.json({ status: 'success', data: status });
      } catch (error2) {
        if (error2 instanceof Error && error2.message.includes('not found')) {
          throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
        }
        throw error2;
      }
    }
  }

  async update(request: Request, response: Response): Promise<Response> {
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

  async verifyLabel(request: Request, response: Response): Promise<Response> {
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

  async updateLabel(request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    const repo = new PrismaLabelExtractionRepository(prisma);
    const existing = await repo.findById(safeId);
    if (!existing) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (!existing.rawText || existing.rawText.trim().length === 0) {
      throw AppError.badRequest('Raw text is empty or missing', 'EMPTY_RAW_TEXT');
    }
    const extractedLabel = await extractStructuredTreatmentData(existing.rawText);
    const extractedFields: string[] = [];
    if (extractedLabel.prodotto) extractedFields.push('prodotto');
    if (extractedLabel.categoria) extractedFields.push('categoria');
    if (extractedLabel.principio_attivo) extractedFields.push('principio_attivo');
    if (extractedLabel.composizione) extractedFields.push('composizione');
    if (extractedLabel.malattie.length > 0) extractedFields.push('malattie');
    if (extractedLabel.specie.length > 0) extractedFields.push('specie');
    if (extractedLabel.colture_target.length > 0) extractedFields.push('colture_target');
    if (extractedLabel.dosaggi_dettagliati.length > 0) extractedFields.push('dosaggi_dettagliati');
    const updateData = {
      label: extractedLabel,
      extractionConfidence: extractedLabel.extraction_confidence,
      extractedFields,
      errors: extractedLabel.errors,
      category: LabelCategory.FITO,
    };
    const updated = await repo.updateById(safeId, updateData);
    if (!updated) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (userId) {
      const historyRepo = new PrismaLabelHistoryRepository(prisma);
      const changes = calculateLabelChanges(existing, updateData);
      if (changes.length > 0) {
        const snapshot = createLabelSnapshot(existing);
        await historyRepo.create({
          labelExtractionId: safeId,
          userId,
          changes,
          previousSnapshot: snapshot,
        });
      }
    }
    return response.json({ status: 'success', data: updated });
  }

  async extractLabelWithMistral(request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    const repo = new PrismaLabelExtractionRepository(prisma);
    const existing = await repo.findById(safeId);
    if (!existing) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (!existing.rawText || existing.rawText.trim().length === 0) {
      throw AppError.badRequest('Raw text is empty or missing', 'EMPTY_RAW_TEXT');
    }
    const extractedLabel = await extractStructuredTreatmentDataWithMistral(existing.rawText);
    if (!isUsableLabel(extractedLabel)) {
      throw AppError.badRequest(
        'Re-extraction returned an empty or unusable label; existing data was not overwritten',
        'EMPTY_LABEL_EXTRACTION',
      );
    }
    const extractedFields: string[] = [];
    if (extractedLabel.prodotto) extractedFields.push('prodotto');
    if (extractedLabel.categoria) extractedFields.push('categoria');
    if (extractedLabel.principio_attivo) extractedFields.push('principio_attivo');
    if (extractedLabel.composizione) extractedFields.push('composizione');
    if (extractedLabel.malattie.length > 0) extractedFields.push('malattie');
    if (extractedLabel.specie.length > 0) extractedFields.push('specie');
    if (extractedLabel.colture_target.length > 0) extractedFields.push('colture_target');
    if (extractedLabel.dosaggi_dettagliati.length > 0) extractedFields.push('dosaggi_dettagliati');
    const updateData = {
      label: extractedLabel,
      extractionConfidence: extractedLabel.extraction_confidence,
      extractedFields,
      errors: extractedLabel.errors,
      category: LabelCategory.FITO,
    };
    const updated = await repo.updateById(safeId, updateData);
    if (!updated) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (userId) {
      const historyRepo = new PrismaLabelHistoryRepository(prisma);
      const changes = calculateLabelChanges(existing, updateData);
      if (changes.length > 0) {
        const snapshot = createLabelSnapshot(existing);
        await historyRepo.create({
          labelExtractionId: safeId,
          userId,
          changes,
          previousSnapshot: snapshot,
        });
      }
    }
    return response.json({ status: 'success', data: updated });
  }

  /**
   * Re-extracts label data using GPT-4o Vision with high-resolution PDF images.
   * First enhances the rawText using GPT Vision, then extracts structured data.
   */
  async extractLabelWithGpt(request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const userId = (request as { user?: { id?: string } }).user?.id;
    const repo = new PrismaLabelExtractionRepository(prisma);
    const existing = await repo.findById(safeId);
    if (!existing) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (!existing.sourceUrl || existing.sourceUrl.trim().length === 0) {
      throw AppError.badRequest('Source URL is empty or missing', 'EMPTY_SOURCE_URL');
    }
    const existingRawText = existing.rawText || '';
    console.log(`[GPT_EXTRACTION] Starting GPT Vision extraction for label ${safeId}`);
    console.log(`[GPT_EXTRACTION] Source URL: ${existing.sourceUrl}`);
    console.log(`[GPT_EXTRACTION] Existing rawText length: ${existingRawText.length} chars`);
    const enhancedRawText = await enhanceRawTextWithGptVision(existing.sourceUrl, existingRawText);
    console.log(`[GPT_EXTRACTION] Enhanced rawText length: ${enhancedRawText.length} chars`);
    const extractedLabel = await extractStructuredTreatmentData(enhancedRawText);
    if (!isUsableLabel(extractedLabel)) {
      throw AppError.badRequest(
        'Re-extraction returned an empty or unusable label; existing data was not overwritten',
        'EMPTY_LABEL_EXTRACTION',
      );
    }
    const extractedFields: string[] = [];
    if (extractedLabel.prodotto) extractedFields.push('prodotto');
    if (extractedLabel.categoria) extractedFields.push('categoria');
    if (extractedLabel.principio_attivo) extractedFields.push('principio_attivo');
    if (extractedLabel.composizione) extractedFields.push('composizione');
    if (extractedLabel.malattie.length > 0) extractedFields.push('malattie');
    if (extractedLabel.specie.length > 0) extractedFields.push('specie');
    if (extractedLabel.colture_target.length > 0) extractedFields.push('colture_target');
    if (extractedLabel.dosaggi_dettagliati.length > 0) extractedFields.push('dosaggi_dettagliati');
    const updateData = {
      rawText: enhancedRawText,
      label: extractedLabel,
      extractionConfidence: extractedLabel.extraction_confidence,
      extractedFields,
      errors: extractedLabel.errors,
      category: LabelCategory.FITO,
    };
    const updated = await repo.updateById(safeId, updateData);
    if (!updated) {
      throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    }
    if (userId) {
      const historyRepo = new PrismaLabelHistoryRepository(prisma);
      const changes = calculateLabelChanges(existing, updateData);
      if (changes.length > 0) {
        const snapshot = createLabelSnapshot(existing);
        await historyRepo.create({
          labelExtractionId: safeId,
          userId,
          changes,
          previousSnapshot: snapshot,
        });
      }
    }
    return response.json({ status: 'success', data: updated });
  }

  async getLabelHistory(request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    const safeId = String(id ?? '').trim();
    if (!safeId) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }
    const historyRepo = new PrismaLabelHistoryRepository(prisma);
    const useCase = new GetLabelHistoryUseCase(historyRepo);
    const history = await useCase.execute({ labelExtractionId: safeId });
    return response.json({ status: 'success', data: history });
  }

  async rollbackLabel(request: Request, response: Response): Promise<Response> {
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
}
