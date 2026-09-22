/**
 * ScrapeGraph AI API Types
 * Documentation: https://docs.scrapegraphai.com/
 */

/**
 * Extraction category for disciplinari data
 */
export type DisciplinariExtractionCategory =
  | 'metadata'
  | 'rules'
  | 'defense_targets'
  | 'interventions'
  | 'scope_entities';

/**
 * ScrapeGraph SmartScraper request parameters
 */
export interface ScrapeGraphSmartScraperRequest {
  readonly website_url: string;
  readonly user_prompt: string;
  readonly output_schema?: Record<string, unknown>;
}

/**
 * ScrapeGraph API response
 */
export interface ScrapeGraphResponse<T = unknown> {
  readonly request_id: string;
  readonly status: 'completed' | 'failed' | 'pending';
  readonly result?: T;
  readonly error?: string;
}

/**
 * Extraction result with categorization
 */
export interface CategorizedExtractionResult {
  readonly category: DisciplinariExtractionCategory;
  readonly confidence: number;
  readonly data: unknown;
  readonly sourceUrl: string;
  readonly extractedAt: Date;
}

/**
 * ScrapeGraph configuration
 */
export interface ScrapeGraphConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeout?: number;
  readonly maxRetries?: number;
}
