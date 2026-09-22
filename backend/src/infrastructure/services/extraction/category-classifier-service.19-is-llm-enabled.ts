import { hasChatLlmApiKey } from '../llm-config';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceIsLlmEnabled(this: CategoryClassifierServiceContext): boolean {
    if (process.env.LLM_CATEGORY_CLASSIFIER_ENABLED === 'false') return false;
    return hasChatLlmApiKey();
  }
