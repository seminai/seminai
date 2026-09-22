import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { type FileFormat } from './file-format-resolver';
import { ClassificationSource, LlmCategoryOutput } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceApplyGuardrails(this: CategoryClassifierServiceContext, fileFormat: FileFormat, llm: LlmCategoryOutput, detection?: FileDetectionResult): {
    category: ResolvedCategory;
    confidence: number;
    reason: string;
    source: ClassificationSource;
  } {
    if (fileFormat === 'xml' || fileFormat === 'image') {
      return {
        category: 'invoice',
        confidence: 1,
        reason: `Guardrail forced invoice for ${fileFormat}`,
        source: 'hybrid',
      };
    }
    if (fileFormat === 'shapefile') {
      return {
        category: 'fields',
        confidence: 1,
        reason: 'Guardrail forced fields for shapefile zip',
        source: 'hybrid',
      };
    }
    if (fileFormat === 'geojson') {
      return {
        category: 'agricultural',
        confidence: 1,
        reason: 'Guardrail forced agricultural for PCG GeoJSON',
        source: 'hybrid',
      };
    }
    if (fileFormat === 'csv_excel' && (llm.category === 'invoice' || llm.category === 'ddt')) {
      return {
        category: detection?.type === 'warehouse_stock' ? 'stock' : 'agricultural',
        confidence: 0.45,
        reason: 'Guardrail rejected invoice/ddt for csv_excel',
        source: 'hybrid',
      };
    }
    return {
      category: llm.category,
      confidence: llm.confidence,
      reason: llm.reason,
      source: 'llm',
    };
  }
