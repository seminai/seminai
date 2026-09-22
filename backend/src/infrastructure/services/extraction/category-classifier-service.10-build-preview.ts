import { type FileFormat } from './file-format-resolver';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceBuildPreview(this: CategoryClassifierServiceContext, fileFormat: FileFormat, pdfText?: string): string {
    if (fileFormat !== 'pdf' || !pdfText) return 'n/a';
    return pdfText.replace(/\s+/g, ' ').trim().slice(0, 1400);
  }
