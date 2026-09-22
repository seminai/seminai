import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import {
  deletePendingExtraction,
  getPendingExtraction,
  updatePendingExtractionData,
} from '../../persistence/pending-extraction-store';
import { getExtractionFields, getExtractionSchema } from '../../../domain/extraction-schemas';
import { createChatEmitter } from '../../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import { CommitExtractionFromChatUseCase } from '../../../application/use-cases/extraction/CommitExtractionFromChatUseCase';
import { writeExtractionArchivedMessage } from '../../queue/chat-extraction-message-writer';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class AgentExtractionReviewController {
  constructor(
    private readonly commitUseCase: CommitExtractionFromChatUseCase = new CommitExtractionFromChatUseCase(),
  ) {}

  /**
   * GET /agent-chat/pending-extraction/:reviewId
   * Returns the current pending review payload (rehydrates the form after a refresh).
   */
  async getById(req: Request, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { reviewId } = req.params;
    if (!reviewId) {
      throw AppError.badRequest('Review ID is required', 'INVALID_REVIEW_ID');
    }
    const existing = await getPendingExtraction(reviewId);
    if (!existing) {
      throw AppError.notFound('Pending extraction not found or expired', 'REVIEW_NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw AppError.forbidden('You do not own this extraction review', 'REVIEW_ACCESS_DENIED');
    }
    return res.status(200).json({
      status: 'success',
      data: {
        reviewId: existing.reviewId,
        category: existing.category,
        companyId: existing.companyId,
        fileName: existing.fileName,
        fileUrl: existing.fileUrl,
        fields: getExtractionFields(existing.category),
        data: existing.data,
        updatedAt: new Date(existing.updatedAt).toISOString(),
      },
    });
  }

  /**
   * POST /agent-chat/pending-extraction/:reviewId/commit
   * Persists the pending review into a FileExtraction (status PENDING_CONFIRMATION),
   * deletes the Redis pending and emits agent:extraction_archived.
   */
  async commit(req: Request, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { reviewId } = req.params;
    if (!reviewId) {
      throw AppError.badRequest('Review ID is required', 'INVALID_REVIEW_ID');
    }
    const pending = await getPendingExtraction(reviewId);
    if (!pending) {
      throw AppError.notFound('Pending extraction not found or expired', 'REVIEW_NOT_FOUND');
    }
    if (pending.userId !== userId) {
      throw AppError.forbidden('You do not own this extraction review', 'REVIEW_ACCESS_DENIED');
    }

    // Optional inline edit: client may pass `{ data }` to persist last-minute edits with the commit.
    const body = req.body as { data?: unknown } | undefined;
    if (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      const schema = getExtractionSchema(pending.category);
      const parsed = schema.zodSchema.safeParse(body.data);
      if (!parsed.success) {
        return res.status(400).json({
          status: 'error',
          code: 'REVIEW_VALIDATION_FAILED',
          message: 'Some fields are invalid',
          issues: parsed.error.issues.slice(0, 10),
        });
      }
      await updatePendingExtractionData(reviewId, parsed.data as Record<string, unknown>);
    }

    const result = await this.commitUseCase.execute({ reviewId, userId });

    const emitter = createChatEmitter(pending.threadId);
    emitter?.emitExtractionArchived({
      reviewId,
      extractionId: result.extractionId,
      archiveUrl: result.archiveUrl,
      documentCategory: result.documentCategory,
      companyId: result.companyId,
      fileName: result.fileName,
    });

    await writeExtractionArchivedMessage({
      threadId: pending.threadId,
      fileName: result.fileName,
      documentCategory: result.documentCategory,
      extractionId: result.extractionId,
      archiveUrl: result.archiveUrl,
    });

    return res.status(201).json({ status: 'success', data: result });
  }

  /**
   * PATCH /agent-chat/pending-extraction/:reviewId
   * Saves user edits to a pending extraction review payload.
   * Validates against the category-specific Zod schema.
   * Returns the updated record. Does NOT commit to FileExtraction (Fase 4).
   */
  async save(req: Request, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { reviewId } = req.params;
    if (!reviewId) {
      throw AppError.badRequest('Review ID is required', 'INVALID_REVIEW_ID');
    }
    const body = req.body as { data?: unknown };
    if (!isPlainObject(body.data)) {
      throw AppError.badRequest(
        'Body must contain a `data` object with field key/value pairs',
        'INVALID_REVIEW_BODY',
      );
    }

    const existing = await getPendingExtraction(reviewId);
    if (!existing) {
      throw AppError.notFound('Pending extraction not found or expired', 'REVIEW_NOT_FOUND');
    }
    if (existing.userId !== userId) {
      throw AppError.forbidden('You do not own this extraction review', 'REVIEW_ACCESS_DENIED');
    }

    const schema = getExtractionSchema(existing.category);
    const parsed = schema.zodSchema.safeParse(body.data);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        code: 'REVIEW_VALIDATION_FAILED',
        message: 'Some fields are invalid',
        issues: parsed.error.issues.slice(0, 10),
      });
    }

    const dataToPersist = parsed.data as Record<string, unknown>;
    const updated = await updatePendingExtractionData(reviewId, dataToPersist);
    if (!updated) {
      throw AppError.notFound('Pending extraction not found or expired', 'REVIEW_NOT_FOUND');
    }

    const emitter = createChatEmitter(existing.threadId);
    emitter?.emitExtractionReviewSaved(reviewId, dataToPersist);

    return res.status(200).json({
      status: 'success',
      data: {
        reviewId: updated.reviewId,
        category: updated.category,
        companyId: updated.companyId,
        fileName: updated.fileName,
        fileUrl: updated.fileUrl,
        data: updated.data,
        updatedAt: new Date(updated.updatedAt).toISOString(),
      },
    });
  }

  /**
   * POST /agent-chat/pending-extraction/:reviewId/cancel
   * Discards a pending extraction review.
   */
  async cancel(req: Request, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { reviewId } = req.params;
    if (!reviewId) {
      throw AppError.badRequest('Review ID is required', 'INVALID_REVIEW_ID');
    }

    const existing = await getPendingExtraction(reviewId);
    if (!existing) {
      return res.status(200).json({ status: 'success', alreadyGone: true });
    }
    if (existing.userId !== userId) {
      throw AppError.forbidden('You do not own this extraction review', 'REVIEW_ACCESS_DENIED');
    }

    await deletePendingExtraction(reviewId);
    const emitter = createChatEmitter(existing.threadId);
    emitter?.emitExtractionReviewCancelled(reviewId);

    return res.status(200).json({ status: 'success', reviewId });
  }
}
