import { CategoryClassificationResult, CATEGORY_CACHE, DEFAULT_CACHE_TTL_MS } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceSetCached(this: CategoryClassifierServiceContext, key: string, value: CategoryClassificationResult): void {
    CATEGORY_CACHE.set(key, { value, expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS });
  }
