import { DetectionConfidence } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceToBucket(this: CategoryClassifierServiceContext, confidence: number): DetectionConfidence {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }
