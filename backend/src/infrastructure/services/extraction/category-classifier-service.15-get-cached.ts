import { CategoryClassificationResult, CATEGORY_CACHE } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceGetCached(this: CategoryClassifierServiceContext, key: string): CategoryClassificationResult | null {
    const cached = CATEGORY_CACHE.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      CATEGORY_CACHE.delete(key);
      return null;
    }
    return { ...cached.value, fromCache: true };
  }
