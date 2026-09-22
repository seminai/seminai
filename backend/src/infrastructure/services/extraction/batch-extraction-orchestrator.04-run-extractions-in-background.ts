import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type BatchExtractionCategory } from '../../../domain/dtos/file-extraction.dto';
import { getBatchExtractionQueue } from '../../queue/BatchExtractionQueue';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export function batchExtractionOrchestratorRunExtractionsInBackground(this: BatchExtractionOrchestratorContext, files: readonly MulterFileInput[], extractions: FileExtractionRecord[], userCategories: readonly BatchExtractionCategory[], companyId: string, batchId: string): void {
    const queue = getBatchExtractionQueue();
    const enqueueAll = extractions.map((extraction, i) =>
      queue.addJob({
        extractionId: extraction.id,
        batchId,
        fileIndex: extraction.fileIndex,
        fileName: extraction.fileName,
        mimeType: files[i].mimetype,
        companyId,
        userCategory: userCategories[i] ?? 'auto',
        fileUrl: extraction.fileUrl ?? undefined,
      }),
    );
    Promise.all(enqueueAll).catch((err) =>
      console.error('[BATCH-EXTRACTION] Failed to enqueue jobs:', err),
    );
  }
