import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import { getLabelRefreshQueue } from '../../queue/LabelRefreshQueue';
import { LabelRefreshJobData, LabelRefreshMode } from '../../queue/LabelRefreshTypes';

const VALID_MODES: readonly LabelRefreshMode[] = ['stale', 'all', 'ids'];

export class LabelRefreshController {
  async enqueueFromCron(request: Request, response: Response): Promise<Response> {
    this.assertCronSecret(request);
    const jobData = this.parseJobData(request.body);
    const jobId = await getLabelRefreshQueue().addJob(jobData);
    return response.json({ queued: true, jobId });
  }

  async enqueueSingleLabel(request: Request, response: Response): Promise<Response> {
    const labelId = String(request.params.id ?? '').trim();
    if (!labelId) throw AppError.badRequest('Missing id', 'MISSING_ID');
    const repo = new PrismaLabelExtractionRepository(prisma);
    const label = await repo.findById(labelId);
    if (!label) throw AppError.notFound('Label extraction not found', 'LABEL_NOT_FOUND');
    const jobId = await getLabelRefreshQueue().addJob({
      mode: 'ids',
      labelExtractionIds: [labelId],
      limit: 1,
      dryRun: false,
    });
    return response.json({ status: 'success', data: { queued: true, jobId } });
  }

  private assertCronSecret(request: Request): void {
    const expected = process.env.LABEL_REFRESH_CRON_SECRET;
    if (!expected) {
      throw AppError.internal('LABEL_REFRESH_CRON_SECRET is not configured', 'CRON_SECRET_MISSING');
    }
    const provided = String(request.header('X-Cron-Secret') ?? '');
    if (provided !== expected) {
      throw AppError.unauthorized('Invalid cron secret', 'INVALID_CRON_SECRET');
    }
  }

  private parseJobData(rawBody: unknown): LabelRefreshJobData {
    const body = this.asRecord(rawBody);
    const mode = this.parseMode(body.mode);
    return {
      mode,
      labelExtractionIds: this.parseIds(body.labelExtractionIds),
      limit: this.parseLimit(body.limit),
      dryRun: body.dryRun === true,
    };
  }

  private parseMode(value: unknown): LabelRefreshMode {
    const mode = String(value ?? 'stale');
    return VALID_MODES.includes(mode as LabelRefreshMode) ? (mode as LabelRefreshMode) : 'stale';
  }

  private parseIds(value: unknown): readonly string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0);
  }

  private parseLimit(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }
}
