/**
 * Tavily Result Validation Module
 *
 * This module provides services for validating Tavily search results
 * against geographic region and keyword criteria before using them
 * to answer user queries about agricultural products and regulations.
 */

// Types
export type {
  ValidationContext,
  TavilyResult,
  ValidatedTavilyResult,
  FetchResult,
  KeywordSearchResult,
  ValidationConfig,
} from './types';
export { DEFAULT_VALIDATION_CONFIG, OFFICIAL_DOMAINS } from './types';

// Services
export { TavilyResultValidationService } from './TavilyResultValidationService';
export { ContentFetcherService } from './ContentFetcherService';
export { InMemoryVectorSearchService } from './InMemoryVectorSearchService';

// Job Context Helpers
export {
  getFieldRegionByJobId,
  getAllFieldRegionsByJobId,
  extractKeywordsFromQuery,
  getJobContext,
} from './JobContextEnricher';
