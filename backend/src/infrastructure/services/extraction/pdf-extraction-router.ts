import { DocumentCategory } from '@prisma/client';
import type { CategoryClassificationResult } from './category-classifier.service';
import type { ResolvedFileCategory } from './file-category-resolver';

export type PdfExtractionRoute = 'commercial' | 'piano_colturale';

export interface PdfExtractionRouting {
  readonly route: PdfExtractionRoute;
  readonly detectedFileType: 'agricultural' | 'invoice' | 'ddt';
  readonly documentCategory: DocumentCategory;
  readonly reason: string;
}

function mapCategoryToDocumentCategory(
  category: ResolvedFileCategory['category'],
  detectionType?: string,
): DocumentCategory {
  if (category === 'invoice') return 'FATTURA';
  if (category === 'ddt') return 'DDT';
  if (category === 'stock') return 'MAGAZZINO';
  if (detectionType === 'piano_colturale') return 'PIANO_COLTURALE';
  if (category === 'fields' || category === 'production_units') return 'FASCICOLO_AZIENDALE';
  return 'PIANO_COLTURALE';
}

function mapCategoryToDetectedFileType(
  category: ResolvedFileCategory['category'],
): PdfExtractionRouting['detectedFileType'] {
  if (category === 'invoice') return 'invoice';
  if (category === 'ddt') return 'ddt';
  return 'agricultural';
}

function mapCategoryToRoute(category: ResolvedFileCategory['category']): PdfExtractionRoute {
  if (category === 'invoice' || category === 'ddt' || category === 'stock') {
    return 'commercial';
  }
  return 'piano_colturale';
}

/**
 * Maps auto-classification output to chat PDF extraction routing.
 */
export function mapPdfExtractionRoute(resolved: ResolvedFileCategory): PdfExtractionRouting {
  const detectionType = resolved.detection?.type;
  const route = mapCategoryToRoute(resolved.category);
  return {
    route,
    detectedFileType: mapCategoryToDetectedFileType(resolved.category),
    documentCategory: mapCategoryToDocumentCategory(resolved.category, detectionType),
    reason: resolved.detection?.reason ?? `Resolved as ${resolved.category}`,
  };
}

/**
 * Adapter when only CategoryClassificationResult is available.
 */
export function mapPdfExtractionRouteFromClassification(
  classification: CategoryClassificationResult,
): PdfExtractionRouting {
  return mapPdfExtractionRoute({
    category: classification.category,
    fileFormat: 'pdf',
    isAsync: classification.category === 'agricultural',
    detection: classification.detection,
  });
}
