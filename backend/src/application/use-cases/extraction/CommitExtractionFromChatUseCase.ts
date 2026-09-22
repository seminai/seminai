import {
  Prisma,
  type DocumentCategory,
  type FileExtraction,
  type FileExtractionStatus,
} from '@prisma/client';
import { prisma } from '../../../infrastructure/repositories/Prisma';
import {
  deletePendingExtraction,
  getPendingExtraction,
} from '../../../infrastructure/persistence/pending-extraction-store';
import { AppError } from '../../../domain/errors/AppError';
import { mapInvoiceReviewToExtractionData } from './map-invoice-review-to-extraction-data';

const CATEGORY_TO_LEGACY: Readonly<Record<DocumentCategory, string>> = {
  DDT: 'ddt',
  FATTURA: 'invoice',
  PIANO_COLTURALE: 'agricultural',
  MAGAZZINO: 'stock',
  ETICHETTA: 'stock',
  DISCIPLINARE: 'stock',
  FASCICOLO_AZIENDALE: 'stock',
  VISURA_AZIENDALE: 'stock',
  NOTA: 'stock',
  CERTIFICAZIONE: 'stock',
  ALTRO: 'stock',
};

export interface CommitExtractionFromChatInput {
  readonly reviewId: string;
  readonly userId: string;
}

export interface CommitExtractionFromChatResult {
  readonly extractionId: string;
  readonly archiveUrl: string;
  readonly status: FileExtractionStatus;
  readonly documentCategory: DocumentCategory;
  readonly companyId: string;
  readonly fileName: string;
}

/**
 * Commits a pending extraction review (Redis) into a persistent FileExtraction row.
 * Sets status = PENDING_CONFIRMATION so the existing archive review flow
 * (ExtractionConfirmer) remains the source of truth for business side-effects.
 *
 * After commit the Redis pending record is removed so the chat form
 * cannot be re-submitted twice.
 */
export class CommitExtractionFromChatUseCase {
  async execute(input: CommitExtractionFromChatInput): Promise<CommitExtractionFromChatResult> {
    const pending = await getPendingExtraction(input.reviewId);
    if (!pending) {
      throw AppError.notFound('Pending extraction not found or expired', 'REVIEW_NOT_FOUND');
    }
    if (pending.userId !== input.userId) {
      throw AppError.forbidden('You do not own this extraction review', 'REVIEW_ACCESS_DENIED');
    }

    const fileRecordId = await this.ensureFileRecord({
      userId: input.userId,
      companyId: pending.companyId,
      fileName: pending.fileName,
      fileUrl: pending.fileUrl,
      existingFileId: pending.fileId,
    });

    const legacyCategory = CATEGORY_TO_LEGACY[pending.category];
    const extractedData = await this.buildExtractedData(pending.category, pending.data);

    const created = await prisma.fileExtraction.create({
      data: {
        batchId: `chat-${pending.threadId}`,
        status: 'PENDING_CONFIRMATION',
        category: legacyCategory,
        documentCategory: pending.category,
        progress: 100,
        extractedData,
        fileName: pending.fileName,
        fileIndex: 0,
        fileId: fileRecordId,
        companyId: pending.companyId,
        userId: pending.userId,
      },
    });

    await deletePendingExtraction(input.reviewId);

    return {
      extractionId: created.id,
      archiveUrl: this.buildArchiveUrl(created),
      status: created.status,
      documentCategory: pending.category,
      companyId: pending.companyId,
      fileName: pending.fileName,
    };
  }

  private async ensureFileRecord(input: {
    readonly userId: string;
    readonly companyId: string;
    readonly fileName: string;
    readonly fileUrl?: string;
    readonly existingFileId?: string;
  }): Promise<string | null> {
    if (input.existingFileId) return input.existingFileId;
    if (!input.fileUrl) return null;
    const file = await prisma.file.create({
      data: {
        name: input.fileName,
        url: input.fileUrl,
        type: 'document',
        companyId: input.companyId,
      },
    });
    return file.id;
  }

  private buildArchiveUrl(extraction: FileExtraction): string {
    return `/archivio/${extraction.id}`;
  }

  private async buildExtractedData(
    category: DocumentCategory,
    reviewData: Record<string, unknown>,
  ): Promise<Prisma.InputJsonValue> {
    if (category === 'FATTURA' || category === 'DDT') {
      const data = await mapInvoiceReviewToExtractionData(reviewData);
      return data as unknown as Prisma.InputJsonValue;
    }
    return reviewData as Prisma.InputJsonValue;
  }
}
