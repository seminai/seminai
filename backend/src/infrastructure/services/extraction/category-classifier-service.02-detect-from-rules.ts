import { detectCsvExcelType, detectPdfType, detectZipType, detectGeoJsonType, type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type FileFormat } from './file-format-resolver';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceDetectFromRules(this: CategoryClassifierServiceContext, fileFormat: FileFormat, fileBuffer: Buffer, pdfText?: string): FileDetectionResult | undefined {
    if (fileFormat === 'csv_excel') {
      return detectCsvExcelType(fileBuffer);
    }
    if (fileFormat === 'pdf' && pdfText) {
      return detectPdfType(pdfText);
    }
    if (fileFormat === 'shapefile') {
      return detectZipType(fileBuffer);
    }
    if (fileFormat === 'geojson') {
      return detectGeoJsonType(fileBuffer);
    }
    return undefined;
  }
