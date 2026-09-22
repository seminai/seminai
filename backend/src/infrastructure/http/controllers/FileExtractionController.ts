import { type Request, type Response } from 'express';
import { type FileExtractionStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type IFileExtractionRepository } from '../../../domain/repositories/IFileExtractionRepository';
import {
  type BatchExtractionCategory,
  type FileExtractionResponse,
  type FileExtractionListSortBy,
  type ListFileExtractionsQuery,
  type ResolvedCategory,
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
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
      userId: request.user.id,
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const listQuery = parseListQuery(request.query);
    const result = await this.listFileExtractionsUseCase.execute({
      userId: request.user.id,
      query: listQuery,
    });
    return response.json({
      status: 'success',
      data: result,
    });
  }

  async filterOptions(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const companies = await this.companyRepository.findManyByUserId(request.user.id);
    const allowedCompanyIds = companies.map((c) => c.id);
    const options = await this.repository.findFilterOptions(allowedCompanyIds);
    return response.json({ status: 'success', data: options });
  }

  async listCategorySummary(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const companyId = parseOptionalString(request.query.companyId);
    const summary = await this.listExtractionCategorySummaryUseCase.execute({
      userId: request.user.id,
      companyId,
    });
    return response.json({
      status: 'success',
      data: { categories: summary },
    });
  }

  async getById(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId: request.user.id, extraction });
    return response.json({ status: 'success', data: { extraction: toResponse(extraction) } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId: request.user.id, extraction });
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
        userId: request.user.id,
      });
    }
    const updated = await this.repository.update(request.params.id, {
      extractedData: parsedData,
    });
    return response.json({ status: 'success', data: { extraction: toResponse(updated) } });
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId: request.user.id, extraction });
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId: request.user.id, extraction });
    const parsed = parseConfirmRequest(request.body, extraction.category);
    const confirmData: ConfirmExtractionRequestDTO = {
      warehouseId: parsed?.warehouseId,
      invoiceEntries: parsed?.invoiceEntries,
      allowReviewOverride: parsed?.allowReviewOverride,
      actorUserId: request.user.id,
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const records = await this.repository.findByBatchId(request.params.batchId);
    if (records.length === 0) {
      throw AppError.notFound('Batch not found', 'BATCH_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccessBatch({ userId: request.user.id, extractions: records });
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
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const records = await this.repository.findByBatchId(request.params.batchId);
    if (records.length === 0) {
      throw AppError.notFound('Batch not found', 'BATCH_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccessBatch({ userId: request.user.id, extractions: records });
    const result = await this.confirmer.confirmBatch(request.params.batchId);
    return response.json({ status: 'success', data: result });
  }

  async remove(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const extraction = await this.repository.findById(request.params.id);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    await this.accessGuard.assertCanAccess({ userId: request.user.id, extraction });
    await this.repository.deleteById(request.params.id);
    return response.status(204).send();
  }
}

function toResponse(
  record: import('../../../domain/repositories/IFileExtractionRepository').FileExtractionRecord,
): FileExtractionResponse {
  return {
    id: record.id,
    batchId: record.batchId,
    companyId: record.companyId,
    status: record.status,
    category: record.category as FileExtractionResponse['category'],
    progress: record.progress,
    fileName: record.fileName,
    fileIndex: record.fileIndex,
    fileId: record.fileId,
    fileUrl: record.fileUrl,
    extractedData: record.extractedData,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const ALLOWED_STATUSES: readonly FileExtractionStatus[] = [
  'LOADING',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ERROR',
];

const ALLOWED_CATEGORIES: readonly ResolvedCategory[] = [
  'fields',
  'production_units',
  'agricultural',
  'invoice',
  'ddt',
  'stock',
];

const ALLOWED_SORT_FIELDS: readonly FileExtractionListSortBy[] = [
  'updatedAt',
  'fileName',
  'status',
  'category',
];

function parseListQuery(query: Request['query']): ListFileExtractionsQuery {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE, 'page');
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize'),
    MAX_PAGE_SIZE,
  );
  const q = parseOptionalString(query.q);
  const status = parseCsvEnumList<FileExtractionStatus>(query.status, ALLOWED_STATUSES, 'status');
  const category = parseCsvEnumList<ResolvedCategory>(
    query.category,
    ALLOWED_CATEGORIES,
    'category',
  );
  const sortByRaw = parseOptionalString(query.sortBy);
  const sortBy = ALLOWED_SORT_FIELDS.includes(sortByRaw as FileExtractionListSortBy)
    ? (sortByRaw as FileExtractionListSortBy)
    : 'updatedAt';
  const sortOrderRaw = parseOptionalString(query.sortOrder);
  const sortOrder = sortOrderRaw === 'asc' ? 'asc' : 'desc';
  const includeGenerated = parseBoolean(query.includeGenerated);
  const fileNamesRaw = parseOptionalString(query.fileNames);
  const fileNames = fileNamesRaw
    ? fileNamesRaw
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
    : undefined;
  const updatedAtFrom = parseDateBoundary(query.updatedAtFrom, 'updatedAtFrom', 'start');
  const updatedAtTo = parseDateBoundary(query.updatedAtTo, 'updatedAtTo', 'end');
  if (updatedAtFrom && updatedAtTo && updatedAtFrom > updatedAtTo) {
    throw AppError.badRequest(
      'updatedAtFrom must be before or equal to updatedAtTo',
      'INVALID_UPDATEDAT_RANGE',
    );
  }
  return {
    companyId: parseOptionalString(query.companyId),
    page,
    pageSize,
    includeGenerated,
    q,
    fileNames,
    status,
    category,
    sortBy,
    sortOrder,
    updatedAtFrom,
    updatedAtTo,
  };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateBoundary(
  raw: unknown,
  field: string,
  boundary: 'start' | 'end',
): Date | undefined {
  const value = parseOptionalString(raw);
  if (!value) return undefined;
  if (!ISO_DATE_PATTERN.test(value)) {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  const isoSuffix = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
  const parsed = new Date(`${value}${isoSuffix}`);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  return parsed;
}

function parseBoolean(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw AppError.badRequest('Invalid includeGenerated query param', 'INVALID_INCLUDEGENERATED');
}

function parsePositiveInt(raw: unknown, fallback: number, field: string): number {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  return value;
}

function parseOptionalString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseCsvEnumList<T extends string>(
  raw: unknown,
  allowedValues: readonly T[],
  field: string,
): readonly T[] | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  const parsedValues = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T => value.length > 0 && allowedValues.includes(value as T));
  if (parsedValues.length === 0) {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  return parsedValues;
}

function parseConfirmRequest(
  body: unknown,
  category: string,
): ConfirmExtractionRequestDTO | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const payload = body as Record<string, unknown>;
  const warehouseId = parseOptionalBodyString(payload.warehouseId);
  const rawInvoiceEntries = payload.invoiceEntries;
  if (rawInvoiceEntries !== undefined && !Array.isArray(rawInvoiceEntries)) {
    throw AppError.badRequest(
      'Invalid invoiceEntries payload: expected an array',
      'INVALID_CONFIRM_PAYLOAD',
    );
  }
  const allowReviewOverride = parseOptionalBodyBoolean(payload.allowReviewOverride);
  return {
    warehouseId,
    invoiceEntries: Array.isArray(rawInvoiceEntries)
      ? ExtractionDataValidator.parseConfirmEntries(category, rawInvoiceEntries)
      : undefined,
    allowReviewOverride,
  };
}

function parseOptionalBodyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalBodyBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw AppError.badRequest('Invalid allowReviewOverride payload', 'INVALID_CONFIRM_PAYLOAD');
  }
  return value;
}
