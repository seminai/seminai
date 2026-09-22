import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { type FileFormat } from './file-format-resolver';
import { ClassificationSource } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceMergeAsHybridFallback(this: CategoryClassifierServiceContext, guarded: {
      category: ResolvedCategory;
      confidence: number;
      reason: string;
      source: ClassificationSource;
    }, fileFormat: FileFormat, detection?: FileDetectionResult): {
    category: ResolvedCategory;
    confidence: number;
    reason: string;
    source: ClassificationSource;
  } {
    const fallback = this.resolveRuleFallback(fileFormat, detection);
    return {
      category: fallback.category,
      confidence: this.fromBucket(fallback.confidence),
      reason: `LLM low confidence (${guarded.confidence.toFixed(2)}), fallback: ${fallback.reason}`,
      source: 'hybrid',
    };
  }
