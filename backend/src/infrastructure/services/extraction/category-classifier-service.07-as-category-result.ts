import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { type FileFormat } from './file-format-resolver';
import { CategoryClassificationResult } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceAsCategoryResult(this: CategoryClassifierServiceContext, category: ResolvedCategory, fileFormat: FileFormat): Pick<CategoryClassificationResult, 'category' | 'fileFormat' | 'isAsync'> {
    const isAsync = fileFormat === 'pdf' && category === 'agricultural';
    return { category, fileFormat, isAsync };
  }
