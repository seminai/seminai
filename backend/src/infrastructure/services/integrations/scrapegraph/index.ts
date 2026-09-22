/**
 * ScrapeGraph AI Integration
 *
 * Provides AI-powered web scraping for extracting structured data
 * from Italian regional disciplinari (agricultural regulations).
 *
 * @example
 * ```typescript
 * import { createScrapeGraphClient } from './integrations/scrapegraph';
 *
 * const client = createScrapeGraphClient();
 * const result = await client.smartScrape({
 *   website_url: 'https://example.com/disciplinare',
 *   user_prompt: 'Extract metadata from this disciplinare',
 * });
 * ```
 */

// Client
export { ScrapeGraphClient, createScrapeGraphClient } from './client';

// Types
export type {
  ScrapeGraphConfig,
  ScrapeGraphSmartScraperRequest,
  ScrapeGraphResponse,
  DisciplinariExtractionCategory,
  CategorizedExtractionResult,
} from './types';

// Schemas
export {
  DisciplinariMetadataSchema,
  DisciplinariRulesSchema,
  DefenseTargetSchema,
  AllowedInterventionSchema,
  ScopeEntitySchema,
  DisciplinariExtractionSchema,
  GlossaryDefinitionSchema,
  DoseInfoSchema,
  ApplicationLimitsSchema,
} from './schemas';

// Schema output types
export type {
  DisciplinariMetadataOutput,
  DisciplinariRulesOutput,
  DefenseTargetOutput,
  AllowedInterventionOutput,
  ScopeEntityOutput,
  DisciplinariExtractionOutput,
} from './schemas';
