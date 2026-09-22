import { type FieldsExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { normalizeExtractedField } from './field-normalizer';
import { parsePcgGeojson } from '../pcg-geojson-parser';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractFieldsFromGeojson(this: BatchExtractionOrchestratorContext, buffer: Buffer, companyId: string): Promise<FieldsExtractionData> {
    const result = await parsePcgGeojson(buffer);
    return {
      fields: result.fields.map((f) => normalizeExtractedField(f, companyId)),
      extractedCount: result.fields.length,
      diagnostics: result.diagnostics,
    };
  }
