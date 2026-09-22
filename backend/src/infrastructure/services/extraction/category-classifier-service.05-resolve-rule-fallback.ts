import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type FileFormat } from './file-format-resolver';
import { CategoryClassificationResult } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceResolveRuleFallback(this: CategoryClassifierServiceContext, fileFormat: FileFormat, detection?: FileDetectionResult): Omit<CategoryClassificationResult, 'fromCache'> {
    if (fileFormat === 'csv_excel') {
      if (detection?.type === 'warehouse_stock') {
        return {
          ...this.asCategoryResult('stock', fileFormat),
          detection,
          source: 'rule',
          confidence: detection.confidence,
          reason: detection.reason,
        };
      }
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'low',
        reason: detection?.reason ?? 'Default fallback to agricultural for csv/excel',
      };
    }
    if (fileFormat === 'pdf') {
      if (detection?.type === 'invoice') {
        return {
          ...this.asCategoryResult('invoice', fileFormat),
          detection,
          source: 'rule',
          confidence: detection.confidence,
          reason: detection.reason,
        };
      }
      if (detection?.type === 'ddt') {
        return {
          ...this.asCategoryResult('ddt', fileFormat),
          detection,
          source: 'rule',
          confidence: detection.confidence,
          reason: detection.reason,
        };
      }
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'low',
        reason: detection?.reason ?? 'Default fallback to agricultural for pdf',
      };
    }
    if (fileFormat === 'shapefile') {
      return {
        ...this.asCategoryResult('fields', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'high',
        reason: detection?.reason ?? 'ZIP shapefile fallback',
      };
    }
    if (fileFormat === 'geojson') {
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'high',
        reason: detection?.reason ?? 'PCG GeoJSON fallback',
      };
    }
    if (fileFormat === 'xml' || fileFormat === 'image') {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: `${fileFormat} mapped to invoice`,
      };
    }
    return {
      ...this.asCategoryResult('agricultural', fileFormat),
      source: 'rule',
      confidence: 'low',
      reason: 'Unknown format fallback',
    };
  }
