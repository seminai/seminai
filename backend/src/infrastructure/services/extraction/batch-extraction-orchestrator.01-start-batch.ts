import { v4 as uuid } from 'uuid';
import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { groupShapefileUploads } from './group-shapefile-uploads';
import { StartBatchParams } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorStartBatch(this: BatchExtractionOrchestratorContext, params: StartBatchParams): Promise<{
    batchId: string;
    extractions: FileExtractionRecord[];
  }> {
    const { companyId, userId } = params;
    const groupedUploads = groupShapefileUploads(params.files, params.categories);
    const batchId = uuid();
    const extractions = await Promise.all(
      groupedUploads.map((entry, index) =>
        this.prepareSingleExtraction({
          file: entry.file,
          fileIndex: index,
          userCategory: entry.category,
          batchId,
          companyId,
          userId,
        }),
      ),
    );
    this.runExtractionsInBackground(
      groupedUploads.map((entry) => entry.file),
      extractions,
      groupedUploads.map((entry) => entry.category),
      companyId,
      batchId,
    );
    return { batchId, extractions };
  }
