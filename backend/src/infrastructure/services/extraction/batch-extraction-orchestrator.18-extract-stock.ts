import { type StockExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractStock(this: BatchExtractionOrchestratorContext, _file: MulterFileInput, onProgress: (progress: number) => void): Promise<StockExtractionData> {
    onProgress(50);
    return { entries: [], extractedCount: 0 };
  }
