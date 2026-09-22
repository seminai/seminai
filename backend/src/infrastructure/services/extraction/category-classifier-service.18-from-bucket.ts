import { DetectionConfidence } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceFromBucket(this: CategoryClassifierServiceContext, confidence: DetectionConfidence): number {
    if (confidence === 'high') return 0.9;
    if (confidence === 'medium') return 0.6;
    return 0.3;
  }
