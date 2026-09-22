import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { PrismaDisciplinariExtractionRepository } from '../../repositories/PrismaDisciplinariExtractionRepository';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { getDisciplinariExtractionQueue } from '../../queue/DisciplinariExtractionQueue';
import { MulterFile } from '../../services/Multer';

/**
 * Controller for disciplinari extraction operations.
 */
export class DisciplinariController {
  private readonly repository: PrismaDisciplinariExtractionRepository;

  constructor() {
    this.repository = new PrismaDisciplinariExtractionRepository(prisma);
  }

  /**
   * Bulk extract disciplinari from PDF files asynchronously.
   * Creates a job for each PDF and returns immediately with jobId.
   */
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

    const concurrency = parseInt(String(request.body.concurrency ?? '3'), 10);
    const forceReExtract =
      request.body.forceReExtract === 'true' || request.body.forceReExtract === true;

    const fileInputs = files.map((file) => ({
      fileName: file.originalname,
      pdfBuffer: file.buffer,
    }));

    const queue = getDisciplinariExtractionQueue();
    const jobId = await queue.addJob({
      files: fileInputs,
      userId,
      concurrency,
      forceReExtract,
    });

    return response.json({
      status: 'success',
      data: {
        jobId,
        filesQueued: fileInputs.length,
        forceReExtract,
        message: 'Job created successfully. Use /disciplinari/job-status/:jobId to check progress',
      },
    });
  }

  /**
   * Gets the status of a disciplinari extraction job.
   */
  async getJobStatus(request: Request, response: Response): Promise<Response> {
    const { jobId } = request.params as { jobId?: string };
    if (!jobId) {
      throw AppError.badRequest('Missing jobId', 'MISSING_JOB_ID');
    }

    const queue = getDisciplinariExtractionQueue();
    try {
      const status = await queue.getJobStatus(jobId);
      return response.json({ status: 'success', data: status });
    } catch (error) {
      throw AppError.notFound(`Job ${jobId} not found`, 'JOB_NOT_FOUND');
    }
  }

  /**
   * Gets a disciplinari extraction by ID.
   */
  async getById(request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    if (!id) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }

    const extraction = await this.repository.findById(id);
    if (!extraction) {
      throw AppError.notFound('Disciplinari extraction not found', 'NOT_FOUND');
    }

    return response.json({
      status: 'success',
      data: extraction,
    });
  }

  /**
   * Lists all disciplinari extractions with summary info.
   */
  async listSummary(_request: Request, response: Response): Promise<Response> {
    const summaries = await this.repository.listSummary();
    return response.json({
      status: 'success',
      data: summaries,
    });
  }

  /**
   * Lists expired disciplinari extractions.
   */
  async listExpired(_request: Request, response: Response): Promise<Response> {
    const expired = await this.repository.findExpired();
    return response.json({
      status: 'success',
      data: expired.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        region: e.region,
        year: e.year,
        title: e.title,
        validUntil: e.validUntil,
        isExpired: e.isExpired,
        updatedAt: e.updatedAt,
      })),
    });
  }

  /**
   * Lists disciplinari extractions expiring soon.
   */
  async listExpiringSoon(request: Request, response: Response): Promise<Response> {
    const daysParam = request.query.days;
    const days = daysParam ? parseInt(String(daysParam), 10) : 30;

    if (isNaN(days) || days <= 0) {
      throw AppError.badRequest('Invalid days parameter', 'INVALID_DAYS');
    }

    const expiring = await this.repository.findExpiringSoon(days);
    return response.json({
      status: 'success',
      data: expiring.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        region: e.region,
        year: e.year,
        title: e.title,
        validUntil: e.validUntil,
        daysUntilExpiry: e.validUntil
          ? Math.ceil((e.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null,
      })),
    });
  }

  /**
   * Checks validity of a disciplinare by region and year.
   */
  async checkValidity(request: Request, response: Response): Promise<Response> {
    const region = String(request.query.region ?? '').trim();
    const yearParam = request.query.year;
    const year = yearParam ? parseInt(String(yearParam), 10) : null;

    if (!region) {
      throw AppError.badRequest('Missing region parameter', 'MISSING_REGION');
    }

    if (!year || isNaN(year)) {
      throw AppError.badRequest('Missing or invalid year parameter', 'INVALID_YEAR');
    }

    const validity = await this.repository.checkValidity(region, year);
    return response.json({
      status: 'success',
      data: validity,
    });
  }

  /**
   * Searches disciplinari by region and year.
   */
  async searchByRegionAndYear(request: Request, response: Response): Promise<Response> {
    const region = String(request.query.region ?? '').trim();
    const yearParam = request.query.year;
    const year = yearParam ? parseInt(String(yearParam), 10) : null;

    if (!region) {
      throw AppError.badRequest('Missing region parameter', 'MISSING_REGION');
    }

    if (!year || isNaN(year)) {
      throw AppError.badRequest('Missing or invalid year parameter', 'INVALID_YEAR');
    }

    const extractions = await this.repository.findByRegionAndYear(region, year);
    return response.json({
      status: 'success',
      data: extractions.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        region: e.region,
        year: e.year,
        title: e.title,
        version: e.version,
        validFrom: e.validFrom,
        validUntil: e.validUntil,
        isExpired: e.isExpired,
        extractionConfidence: e.extractionConfidence,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    });
  }

  /**
   * Gets extraction statistics.
   */
  async getStats(_request: Request, response: Response): Promise<Response> {
    const stats = await this.repository.getStats();
    return response.json({
      status: 'success',
      data: stats,
    });
  }

  /**
   * Deletes a disciplinari extraction by ID.
   */
  async delete(request: Request, response: Response): Promise<Response> {
    const { id } = request.params as { id?: string };
    if (!id) {
      throw AppError.badRequest('Missing id', 'MISSING_ID');
    }

    const extraction = await this.repository.findById(id);
    if (!extraction) {
      throw AppError.notFound('Disciplinari extraction not found', 'NOT_FOUND');
    }

    await this.repository.delete(id);
    return response.json({
      status: 'success',
      data: { deleted: true },
    });
  }

  /**
   * Bulk deletes disciplinari extractions by IDs.
   */
  async bulkDelete(request: Request, response: Response): Promise<Response> {
    const body = request.body as { ids?: string[] };
    const ids = Array.isArray(body?.ids) ? body.ids : [];

    if (ids.length === 0) {
      throw AppError.badRequest('Body malformato: ids[] richiesto', 'MISSING_IDS');
    }

    const normalizedIds = ids.map((id) => String(id).trim()).filter((id) => id.length > 0);
    if (normalizedIds.length === 0) {
      throw AppError.badRequest('Nessun ID valido fornito', 'INVALID_IDS');
    }

    const deleted = await this.repository.deleteManyByIds(normalizedIds);
    return response.json({
      status: 'success',
      data: { deleted },
    });
  }

  /**
   * Updates expired status for all disciplinari.
   * Should be called by a scheduled job.
   */
  async updateExpiredStatus(_request: Request, response: Response): Promise<Response> {
    const count = await this.repository.updateExpiredStatus();
    return response.json({
      status: 'success',
      data: {
        updatedCount: count,
        message: `Updated ${count} disciplinari to expired status`,
      },
    });
  }
}
