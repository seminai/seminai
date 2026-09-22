import { type Request, type Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type IFileExtractionRepository } from '../../../domain/repositories/IFileExtractionRepository';
import {
  type BatchExtractionCategory,
} from '../../../domain/dtos/file-extraction.dto';
import { type ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import { BatchExtractionOrchestrator } from '../../services/extraction/batch-extraction-orchestrator';
import { ExtractionConfirmer } from '../../services/extraction/extraction-confirmer';
import { ListFileExtractionsUseCase } from '../../../application/use-cases/extraction/ListFileExtractionsUseCase';
import { ListExtractionCategorySummaryUseCase } from '../../../application/use-cases/extraction/ListExtractionCategorySummaryUseCase';
import { type LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { type IFileExtractionEditLogRepository } from '../../../domain/repositories/IFileExtractionEditLogRepository';
import { ExtractionAccessGuard } from '../../../application/use-cases/extraction/ExtractionAccessGuard';
import { ExtractionDataValidator } from '../../services/extraction/extraction-data-validator';
import { requireAuthenticatedUserId } from './controller-auth';
import { parseExtractionConfirmRequest } from './file-extraction-confirm-request';
import { parseFileExtractionListQuery, parseOptionalQueryString } from './file-extraction-query';
import { toFileExtractionResponse } from './file-extraction-response';

export class FileExtractionController {
  private readonly accessGuard: ExtractionAccessGuard;

  constructor(
    private readonly orchestrator: BatchExtractionOrchestrator,
    private readonly confirmer: ExtractionConfirmer,
    private readonly repository: IFileExtractionRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly listFileExtractionsUseCase: ListFileExtractionsUseCase,
    private readonly listExtractionCategorySummaryUseCase: ListExtractionCategorySummaryUseCase,
    private readonly logEditUseCase: LogFileExtractionEditUseCase,
    private readonly editLogRepository: IFileExtractionEditLogRepository,
  ) {
    this.accessGuard = new ExtractionAccessGuard(companyRepository);
  }

  async startBatch(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const files = request.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw AppError.badRequest('No files uploaded', 'NO_FILES');
    }
    const { companyId } = request.body as { companyId?: string };
    if (!companyId) {
      throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    }
    const categoriesRaw = request.body.categories as string | undefined;
    if (!categoriesRaw) {
      throw AppError.badRequest('Missing categories', 'MISSING_CATEGORIES');
    }
    let categories: BatchExtractionCategory[];
    try {
      categories = JSON.parse(categoriesRaw) as BatchExtractionCategory[];
    } catch {
      throw AppError.badRequest('Invalid categories JSON', 'INVALID_CATEGORIES');
    }
    if (categories.length !== files.length) {
      throw AppError.badRequest(
        `categories length (${categories.length}) must match files length (${files.length})`,
        'CATEGORIES_LENGTH_MISMATCH',
      );
    }
    const { batchId, extractions } = await this.orchestrator.startBatch({
      files,
      categories,
      companyId,
      userId,
    });
    return response.status(202).json({
      status: 'accepted',
      data: {
        batchId,
        extractions: extractions.map((e) => ({
          id: e.id,
          fileIndex: e.fileIndex,
          fileName: e.fileName,
          category: e.category,
          status: e.status,
        })),
      },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const listQuery = parseFileExtractionListQuery(request.query);
    const result = await this.listFileExtractionsUseCase.execute({
      userId,
      query: listQuery,
    });
    return response.json({
      status: 'success',
      data: result,
    });
  }

  async filterOptions(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const companies = await this.companyRepository.findManyByUserId(userId);
    const allowedCompanyIds = companies.map((c) => c.id);
    const options = await this.repository.findFilterOptions(allowedCompanyIds);
    return response.json({ status: 'success', data: options });
  }

  async listCategorySummary(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const companyId = parseOptionalQueryString(request.query.companyId);
    const summary = await this.listExtractionCategorySummaryUseCase.execute({
      userId,
      companyId,
    });
    return response.json({
      status: 'success',
      data: { categories: summary },
    });
  }

  async getById(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId, extraction });
    return response.json({
      status: 'success',
      data: { extraction: toFileExtractionResponse(extraction) },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId, extraction });
    if (extraction.status !== 'PENDING_CONFIRMATION' && extraction.status !== 'CONFIRMED') {
      throw AppError.badRequest(
        'Can only edit extractions with status PENDING_CONFIRMATION or CONFIRMED',
        'INVALID_EXTRACTION_STATUS',
      );
    }
    const { extractedData } = request.body as { extractedData?: unknown };
    if (!extractedData) {
      throw AppError.badRequest('Missing extractedData', 'MISSING_EXTRACTED_DATA');
    }
    const parsedData = ExtractionDataValidator.parseForCategory(extraction.category, extractedData);
    if (extraction.category === 'invoice' || extraction.category === 'ddt') {
      await this.ensureLlmInitialLog(extraction);
      await this.logEditUseCase.execute({
        extractionId: request.params.id,
        source: 'USER_EDIT',
        before: extraction.extractedData,
        after: parsedData,
        userId,
      });
    }
    const updated = await this.repository.update(request.params.id, {
      extractedData: parsedData,
    });
    return response.json({
      status: 'success',
      data: { extraction: toFileExtractionResponse(updated) },
    });
  }

  /**
   * Backfill for extractions created before the edit-log feature: if no LLM_INITIAL
   * row exists, synthesize one from the current extractedData snapshot before
   * recording the user edit.
   */
  private async ensureLlmInitialLog(
    extraction: import('../../../domain/repositories/IFileExtractionRepository').FileExtractionRecord,
  ): Promise<void> {
    if (!extraction.extractedData) return;
    const existing = await this.editLogRepository.findByExtractionId(extraction.id);
    if (existing.length > 0) return;
    await this.logEditUseCase.execute({
      extractionId: extraction.id,
      source: 'LLM_INITIAL',
      before: null,
      after: extraction.extractedData,
      userId: null,
    });
  }

  async getEditHistory(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId, extraction });
    const logs = await this.editLogRepository.findByExtractionId(request.params.id);
    return response.json({
      status: 'success',
      data: {
        extractionId: request.params.id,
        logs: logs.map((log) => ({
          id: log.id,
          extractionId: log.extractionId,
          version: log.version,
          source: log.source,
          beforeData: log.beforeData,
          afterData: log.afterData,
          userId: log.userId,
          createdAt: log.createdAt.toISOString(),
        })),
      },
    });
  }

  async confirm(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId, extraction });
    const parsed = parseExtractionConfirmRequest(request.body, extraction.category);
    const confirmData: ConfirmExtractionRequestDTO = {
      warehouseId: parsed?.warehouseId,
      invoiceEntries: parsed?.invoiceEntries,
      allowReviewOverride: parsed?.allowReviewOverride,
      actorUserId: userId,
    };
    const result = await this.confirmer.confirm(request.params.id, confirmData);
    return response.json({ status: 'success', data: result });
  }

  /**
   * Lightweight status snapshot for an entire batch.
   * Used by the FE as a fallback when Socket.IO progress events are unavailable
   * (proxy/firewall blocks WS, dev reconnect storms, etc.).
   */
  async getBatchStatus(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const records = await this.repository.findByBatchId(request.params.batchId);
    if (records.length === 0) {
      throw AppError.notFound('Batch not found', 'BATCH_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccessBatch({ userId, extractions: records });
    return response.json({
      status: 'success',
      data: {
        batchId: request.params.batchId,
        items: records.map((r) => ({
          extractionId: r.id,
          fileIndex: r.fileIndex,
          fileName: r.fileName,
          status: r.status,
          progress: r.progress,
          error: r.error,
        })),
      },
    });
  }

  async confirmBatch(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const records = await this.repository.findByBatchId(request.params.batchId);
    if (records.length === 0) {
      throw AppError.notFound('Batch not found', 'BATCH_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccessBatch({ userId, extractions: records });
    const result = await this.confirmer.confirmBatch(request.params.batchId);
    return response.json({ status: 'success', data: result });
  }

  async remove(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId, extraction });
    await this.repository.deleteById(request.params.id);
    return response.status(204).send();
  }
}
