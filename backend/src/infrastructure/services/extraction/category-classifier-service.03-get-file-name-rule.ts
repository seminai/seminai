import { type FileFormat } from './file-format-resolver';
import { CategoryClassificationResult } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceGetFileNameRule(this: CategoryClassifierServiceContext, fileFormat: FileFormat, fileName: string): Omit<CategoryClassificationResult, 'fromCache'> | null {
    const normalized = fileName.toLowerCase();
    if (fileFormat === 'geojson' || /^pcg_.*\.geojson$/i.test(normalized)) {
      return {
        ...this.asCategoryResult('agricultural', 'geojson'),
        source: 'rule',
        confidence: 'high',
        reason: 'PCG GeoJSON filename indicates agricultural crop plan',
      };
    }
    if (fileFormat !== 'pdf') return null;
    if (/\bddt\b|documento[-_\s]?di[-_\s]?trasporto/.test(normalized)) {
      return {
        ...this.asCategoryResult('ddt', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'PDF filename indicates DDT document',
      };
    }
    if (/fattur|invoice/.test(normalized)) {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'PDF filename indicates invoice document',
      };
    }
    return null;
  }
