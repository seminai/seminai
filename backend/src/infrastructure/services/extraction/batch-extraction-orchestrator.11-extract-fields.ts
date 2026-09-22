import { type FieldsExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { normalizeExtractedField } from './field-normalizer';
import { FieldCsvAgent } from '../agents/file_agent/field_csv_agent';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractFields(this: BatchExtractionOrchestratorContext, file: MulterFileInput, fileFormat: string, companyId: string): Promise<FieldsExtractionData> {
    if (fileFormat === 'shapefile') {
      return this.extractFieldsFromShapefile(file.buffer, companyId, file.originalname);
    }
    if (fileFormat === 'geojson') {
      return this.extractFieldsFromGeojson(file.buffer, companyId);
    }
    const agent = new FieldCsvAgent();
    const result = await agent.extractFieldsFromCsv(file.buffer);
    return {
      fields: result.fields.map((f) => normalizeExtractedField(f, companyId)),
      extractedCount: result.fields.length,
      diagnostics: result.diagnostics,
    };
  }
