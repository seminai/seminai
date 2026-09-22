import type { TreatmentThresholds } from '../../services/treatment-weather/thresholds';

/**
 * Result of asking the Agronomist sub-agent for the weather thresholds that
 * should govern a specific treatment context (products + machine).
 *
 * `source` indicates how the values were obtained:
 *  - `agronomist-llm`: fresh LLM call, just persisted to cache.
 *  - `cache`: read from `WeatherAdvisorCache` (no LLM call this round).
 *  - `default-fallback`: LLM unavailable or returned invalid output; the tool
 *     used `DEFAULT_TREATMENT_THRESHOLDS` and surfaced a warning so the LLM
 *     consumer can communicate the lack of personalization to the user.
 */
export interface AgronomistAdviceDto {
  readonly thresholds: TreatmentThresholds;
  readonly source: 'agronomist-llm' | 'cache' | 'default-fallback';
  readonly reasoning?: string;
  readonly confidence?: 'high' | 'medium' | 'low';
  readonly warnings: readonly string[];
  readonly contextHash: string;
  readonly sourceModel?: string;
}
