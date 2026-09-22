import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { resolveFileCategory, type ResolvedFileCategory } from './file-category-resolver';
import { pdfToText } from '../ocr/pdfToText';
import { resolveFileFormat } from './file-format-resolver';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorResolveWithPdfText(this: BatchExtractionOrchestratorContext, file: MulterFileInput, currentCategory: ResolvedCategory, wasAutoDetected: boolean): Promise<ResolvedFileCategory> {
    const fileFormat = resolveFileFormat(file.mimetype, file.originalname);
    const isPdf = fileFormat === 'pdf';
    if (!isPdf) {
      return { category: currentCategory, fileFormat, isAsync: false };
    }
    if (!wasAutoDetected) {
      return {
        category: currentCategory,
        fileFormat: 'pdf',
        isAsync:
          currentCategory === 'agricultural' ||
          currentCategory === 'fields' ||
          currentCategory === 'production_units',
      };
    }
    const { text } = await pdfToText(file.buffer);
    return resolveFileCategory({
      userCategory: 'auto',
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      pdfText: text,
    });
  }
