import {
  detectCsvExcelType,
  detectPdfType,
  detectZipType,
  type FileDetectionResult,
} from '../agents/dosage_agent_react/tools/file-type-detector';
import {
  type BatchExtractionCategory,
  type ResolvedCategory,
} from '../../../domain/dtos/file-extraction.dto';
import { type FileFormat, resolveFileFormat } from './file-format-resolver';
import { categoryClassifierService } from './category-classifier.service';
import { isVenetoPcgZip } from './veneto-pcg/veneto-pcg-zip-parser';

export interface ResolvedFileCategory {
  readonly category: ResolvedCategory;
  readonly fileFormat: FileFormat;
  readonly isAsync: boolean;
  readonly detection?: FileDetectionResult;
}

/**
 * Resolves the extraction category for a file.
 * @param pdfText - Pre-extracted text for PDFs (to avoid double extraction).
 */
export async function resolveFileCategory(params: {
  userCategory: BatchExtractionCategory;
  fileBuffer: Buffer;
  mimeType: string;
  fileName: string;
  pdfText?: string;
}): Promise<ResolvedFileCategory> {
  const { userCategory, fileBuffer, mimeType, fileName, pdfText } = params;
  const fileFormat = resolveFileFormat(mimeType, fileName);
  if (fileFormat === 'shapefile' && isVenetoPcgZip(fileBuffer)) {
    return Promise.resolve({ category: 'agricultural', fileFormat, isAsync: false });
  }
  if (userCategory !== 'auto') {
    return Promise.resolve(resolveExplicitCategory(userCategory, fileFormat));
  }
  return resolveAutoCategory(fileBuffer, fileFormat, mimeType, fileName, pdfText);
}

function resolveExplicitCategory(
  userCategory: Exclude<BatchExtractionCategory, 'auto'>,
  fileFormat: FileFormat,
): ResolvedFileCategory {
  switch (userCategory) {
    case 'fields':
      return { category: 'fields', fileFormat, isAsync: fileFormat === 'pdf' };
    case 'production_units':
      if (fileFormat === 'shapefile') {
        return { category: 'agricultural', fileFormat, isAsync: false };
      }
      return { category: 'production_units', fileFormat, isAsync: fileFormat === 'pdf' };
    case 'agricultural':
      return {
        category: 'agricultural',
        fileFormat,
        isAsync: fileFormat === 'pdf',
      };
    case 'invoice':
      return { category: 'invoice', fileFormat, isAsync: false };
    case 'ddt':
      return { category: 'ddt', fileFormat, isAsync: false };
    case 'stock':
      return { category: 'stock', fileFormat, isAsync: false };
  }
}

async function resolveAutoCategory(
  fileBuffer: Buffer,
  fileFormat: FileFormat,
  mimeType: string,
  fileName: string,
  pdfText?: string,
): Promise<ResolvedFileCategory> {
  if (process.env.LLM_CATEGORY_CLASSIFIER_ENABLED !== 'false') {
    return categoryClassifierService.classifyAuto({
      fileBuffer,
      mimeType,
      fileName,
      pdfText,
    });
  }
  switch (fileFormat) {
    case 'csv_excel': {
      const detection = detectCsvExcelType(fileBuffer);
      if (detection.type === 'warehouse_stock') {
        return { category: 'stock', fileFormat, isAsync: false, detection };
      }
      return { category: 'agricultural', fileFormat, isAsync: false, detection };
    }
    case 'pdf': {
      if (!pdfText) {
        return { category: 'agricultural', fileFormat, isAsync: true };
      }
      const detection = detectPdfType(pdfText);
      if (detection.type === 'invoice') {
        return { category: 'invoice', fileFormat, isAsync: false, detection };
      }
      if (detection.type === 'ddt') {
        return { category: 'ddt', fileFormat, isAsync: false, detection };
      }
      return { category: 'agricultural', fileFormat, isAsync: true, detection };
    }
    case 'shapefile': {
      const detection = detectZipType(fileBuffer);
      return { category: 'fields', fileFormat: 'shapefile', isAsync: false, detection };
    }
    case 'geojson':
      return { category: 'agricultural', fileFormat: 'geojson', isAsync: false };
    case 'xml':
      return { category: 'invoice', fileFormat, isAsync: false };
    case 'image':
      return { category: 'invoice', fileFormat, isAsync: false };
  }
}
