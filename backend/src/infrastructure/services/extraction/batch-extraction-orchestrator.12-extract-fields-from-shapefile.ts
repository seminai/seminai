import { type FieldsExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { normalizeExtractedField } from './field-normalizer';
import { parseShapefileUpload } from './shapefile-upload-parser';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractFieldsFromShapefile(this: BatchExtractionOrchestratorContext, buffer: Buffer, companyId: string, fileName: string): Promise<FieldsExtractionData> {
    const result = await parseShapefileUpload({ buffer, fileName, mimeType: 'application/zip' });
    return {
      fields: result.fields.map((f) => normalizeExtractedField(f, companyId)),
      extractedCount: result.fields.length,
      diagnostics: result.diagnostics,
    };
  }
