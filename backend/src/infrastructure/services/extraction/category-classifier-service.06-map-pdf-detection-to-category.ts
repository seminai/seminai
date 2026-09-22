import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceMapPdfDetectionToCategory(this: CategoryClassifierServiceContext, type: FileDetectionResult['type']): ResolvedCategory {
    if (type === 'invoice') return 'invoice';
    if (type === 'ddt') return 'ddt';
    return 'agricultural';
  }
