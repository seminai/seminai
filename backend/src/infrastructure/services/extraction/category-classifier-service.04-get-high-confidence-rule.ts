import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type FileFormat } from './file-format-resolver';
import { CategoryClassificationResult } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceGetHighConfidenceRule(this: CategoryClassifierServiceContext, fileFormat: FileFormat, detection?: FileDetectionResult): Omit<CategoryClassificationResult, 'fromCache'> | null {
    if (fileFormat === 'xml') {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'XML is always mapped to invoice pipeline',
      };
    }
    if (fileFormat === 'image') {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'Image is mapped to invoice OCR pipeline',
      };
    }
    if (fileFormat === 'shapefile') {
      return {
        ...this.asCategoryResult('fields', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: detection?.reason ?? 'ZIP shapefile detection',
        detection,
      };
    }
    if (fileFormat === 'geojson') {
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: detection?.reason ?? 'PCG GeoJSON detection',
        detection,
      };
    }
    if (fileFormat === 'csv_excel' && detection?.confidence === 'high') {
      return {
        ...this.asCategoryResult(
          detection.type === 'warehouse_stock' ? 'stock' : 'agricultural',
          fileFormat,
        ),
        source: 'rule',
        confidence: 'high',
        reason: detection.reason,
        detection,
      };
    }
    if (fileFormat === 'pdf' && detection && detection.confidence === 'high') {
      return {
        ...this.asCategoryResult(this.mapPdfDetectionToCategory(detection.type), fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: detection.reason,
        detection,
      };
    }
    return null;
  }
