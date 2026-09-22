import { type ExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { type ResolvedFileCategory } from './file-category-resolver';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractData(this: BatchExtractionOrchestratorContext, file: MulterFileInput, resolved: ResolvedFileCategory, companyId: string, onProgress: (progress: number) => void): Promise<ExtractionData> {
    switch (resolved.category) {
      case 'fields':
        onProgress(50);
        return this.extractFields(file, resolved.fileFormat, companyId);
      case 'production_units':
        return this.extractProductionUnits(file, resolved.fileFormat, companyId, onProgress);
      case 'agricultural':
        return this.extractAgricultural(file, resolved.fileFormat, companyId, onProgress);
      case 'invoice':
        return this.extractInvoice(file, onProgress, companyId);
      case 'ddt':
        return this.extractDdt(file, onProgress, companyId);
      case 'stock':
        return this.extractStock(file, onProgress);
    }
  }
