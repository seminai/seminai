/**
 * Types for the Tavily result validation system.
 * This module provides interfaces for validating search results against
 * region and keyword criteria before using them to answer user queries.
 */

/**
 * Context information used to validate search results.
 */
export interface ValidationContext {
  /** The region to match against (e.g., "Emilia-Romagna") */
  region: string | null;
  /** Keywords to search for in the content (e.g., active ingredient, product name, crop) */
  keywords: string[];
  /** Optional job ID for context */
  jobId?: string;
}

/**
 * A single result from Tavily search.
 */
export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/**
 * A validated Tavily result with relevance scoring.
 */
export interface ValidatedTavilyResult {
  /** The original Tavily result */
  original: TavilyResult;
  /** Whether the result passed validation threshold */
  isValid: boolean;
  /** Whether the content mentions the target region */
  regionMatch: boolean;
  /** Keywords that were found in the content */
  keywordMatches: string[];
  /** Overall relevance score (0-1) */
  relevanceScore: number;
  /** Relevant text snippets extracted from the content */
  extractedSnippets: string[];
  /** Error message if fetching/validation failed */
  fetchError?: string;
}

/**
 * Result of fetching content from a URL.
 */
export interface FetchResult {
  /** Whether the fetch was successful */
  success: boolean;
  /** The type of content fetched */
  contentType: 'html' | 'pdf' | 'unknown';
  /** The extracted text content */
  text: string;
  /** Error message if fetch failed */
  error?: string;
}

/**
 * Result of keyword search in vectorized content.
 */
export interface KeywordSearchResult {
  /** Keywords that were found in the content */
  matchedKeywords: string[];
  /** Total number of keywords searched */
  totalKeywords: number;
  /** Relevant snippets containing the keywords */
  relevantSnippets: string[];
}

/**
 * Configuration for the validation service.
 */
export interface ValidationConfig {
  /** Weight for region match in scoring (default: 0.30) */
  regionWeight?: number;
  /** Weight for keyword match in scoring (default: 0.70) */
  keywordWeight?: number;
  /** Bonus for official domains (default: 0.10) */
  officialDomainBonus?: number;
  /** Minimum score to consider a result valid (default: 0.3) */
  minValidScore?: number;
  /** Similarity threshold for vector search (default: 0.7) */
  similarityThreshold?: number;
  /** Timeout for HTML fetch in ms (default: 10000) */
  htmlFetchTimeout?: number;
  /** Timeout for PDF fetch in ms (default: 30000) */
  pdfFetchTimeout?: number;
  /** Timeout for Mistral OCR in ms (default: 120000) */
  mistralOcrTimeout?: number;
  /** Maximum number of cached URLs (default: 100) */
  cacheMaxSize?: number;
  /** Cache TTL in ms (default: 900000 = 15 min) */
  cacheTtl?: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_VALIDATION_CONFIG: Required<ValidationConfig> = {
  regionWeight: 0.3,
  keywordWeight: 0.7,
  officialDomainBonus: 0.1,
  minValidScore: 0.3,
  similarityThreshold: 0.7,
  htmlFetchTimeout: 10000,
  pdfFetchTimeout: 30000,
  mistralOcrTimeout: 120000,
  cacheMaxSize: 100,
  cacheTtl: 900000,
};

/**
 * Official domains that get a bonus score.
 */
export const OFFICIAL_DOMAINS = [
  'gov.it',
  'regione.',
  'ministero',
  'sian',
  'fitogest',
  'registro',
  'disciplinare',
  'regolamento',
] as const;
