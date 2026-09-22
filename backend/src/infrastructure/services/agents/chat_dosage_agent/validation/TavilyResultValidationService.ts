/**
 * Main validation service for Tavily search results.
 * Orchestrates content fetching, region matching, and keyword validation
 * to ensure search results are relevant to the user's query and geographic context.
 */

import {
  TavilyResult,
  ValidatedTavilyResult,
  ValidationContext,
  ValidationConfig,
  DEFAULT_VALIDATION_CONFIG,
  OFFICIAL_DOMAINS,
} from './types';
import { ContentFetcherService } from './ContentFetcherService';
import { InMemoryVectorSearchService } from './InMemoryVectorSearchService';

/**
 * Service for validating Tavily search results against region and keyword criteria.
 * Ensures that search results are relevant before using them to answer user queries.
 */
export class TavilyResultValidationService {
  private readonly contentFetcher: ContentFetcherService;
  private readonly vectorSearch: InMemoryVectorSearchService;
  private readonly config: Required<ValidationConfig>;

  constructor(config?: Partial<ValidationConfig>) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
    this.contentFetcher = new ContentFetcherService(config);
    this.vectorSearch = new InMemoryVectorSearchService(config);
  }

  /**
   * Validates multiple Tavily results against the given context.
   * Filters out invalid results and sorts by relevance score.
   *
   * @param results - Array of Tavily search results
   * @param context - Validation context with region and keywords
   * @returns Array of validated results, filtered and sorted by relevance
   */
  async validateResults(
    results: TavilyResult[],
    context: ValidationContext,
  ): Promise<ValidatedTavilyResult[]> {
    if (results.length === 0) {
      return [];
    }

    // Validate results in parallel with concurrency limit
    const validationPromises = results.map((result) =>
      this.validateSingleResult(result, context).catch((error) => {
        console.error(`[TavilyValidation] Error validating ${result.url}:`, error);
        return this.createFallbackResult(
          result,
          error instanceof Error ? error.message : 'Validation error',
        );
      }),
    );

    const validatedResults = await Promise.all(validationPromises);

    // Filter by minimum score and sort by relevance
    return validatedResults
      .filter((r) => r.isValid || r.relevanceScore >= this.config.minValidScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Validates a single Tavily result.
   */
  private async validateSingleResult(
    result: TavilyResult,
    context: ValidationContext,
  ): Promise<ValidatedTavilyResult> {
    // Check if URL should use Mistral OCR (for scientific PDFs)
    const useMistralOcr = this.shouldUseMistralOcr(result.url);

    // Fetch content
    const fetchResult = await this.contentFetcher.fetch(result.url, useMistralOcr);

    if (!fetchResult.success) {
      // Use original snippet content as fallback
      return this.validateWithSnippet(result, context, fetchResult.error);
    }

    // Check region match
    const regionMatch = this.checkRegionMatch(fetchResult.text, context.region);

    // Search for keywords
    const keywordResults = await this.vectorSearch.searchKeywords(
      fetchResult.text,
      context.keywords,
    );

    // Calculate relevance score
    const score = this.calculateScore(
      regionMatch,
      keywordResults.matchedKeywords.length,
      context.keywords.length,
      result.url,
    );

    return {
      original: result,
      isValid: score >= this.config.minValidScore,
      regionMatch,
      keywordMatches: keywordResults.matchedKeywords,
      relevanceScore: score,
      extractedSnippets: keywordResults.relevantSnippets,
    };
  }

  /**
   * Validates using only the original Tavily snippet when fetch fails.
   */
  private async validateWithSnippet(
    result: TavilyResult,
    context: ValidationContext,
    fetchError?: string,
  ): Promise<ValidatedTavilyResult> {
    const snippetText = result.content || result.title || '';

    // Check region match in snippet
    const regionMatch = this.checkRegionMatch(snippetText, context.region);

    // Simple text search for keywords in snippet
    const matchedKeywords = context.keywords.filter((keyword) =>
      snippetText.toLowerCase().includes(keyword.toLowerCase()),
    );

    // Calculate score with penalty for not being able to fetch full content
    const baseScore = this.calculateScore(
      regionMatch,
      matchedKeywords.length,
      context.keywords.length,
      result.url,
    );

    // Apply penalty for unverified content (50% reduction)
    const penalizedScore = baseScore * 0.5;

    return {
      original: result,
      isValid: penalizedScore >= this.config.minValidScore,
      regionMatch,
      keywordMatches: matchedKeywords,
      relevanceScore: penalizedScore,
      extractedSnippets: snippetText ? [snippetText.substring(0, 300)] : [],
      fetchError,
    };
  }

  /**
   * Checks if the text mentions the target region.
   */
  private checkRegionMatch(text: string, region: string | null): boolean {
    if (!region) {
      // No region constraint, consider it a match
      return true;
    }

    const normalizedText = text.toLowerCase();
    const normalizedRegion = region.toLowerCase();

    // Generate variations of the region name
    const variations = this.generateRegionVariations(normalizedRegion);

    return variations.some((v) => normalizedText.includes(v));
  }

  /**
   * Generates variations of a region name for matching.
   */
  private generateRegionVariations(region: string): string[] {
    const variations = [region];

    // Add variation without hyphen
    if (region.includes('-')) {
      variations.push(region.replace(/-/g, ' '));
    }

    // Add variation with hyphen instead of space
    if (region.includes(' ')) {
      variations.push(region.replace(/ /g, '-'));
    }

    // Handle common Italian region name variations
    const regionMappings: Record<string, string[]> = {
      'emilia-romagna': ['emilia romagna', 'emilia', 'romagna'],
      'friuli-venezia giulia': ['friuli venezia giulia', 'friuli', 'venezia giulia'],
      'trentino-alto adige': ['trentino alto adige', 'trentino', 'alto adige', 'südtirol'],
      "valle d'aosta": ['valle daosta', "val d'aosta", 'valdaosta', "vallée d'aoste"],
    };

    const key = region.toLowerCase();
    if (regionMappings[key]) {
      variations.push(...regionMappings[key]);
    }

    // Check if region is a key in mappings
    for (const [, aliases] of Object.entries(regionMappings)) {
      if (aliases.includes(key)) {
        variations.push(...aliases);
      }
    }

    return [...new Set(variations)];
  }

  /**
   * Calculates the relevance score for a result.
   */
  private calculateScore(
    regionMatch: boolean,
    matchedKeywordsCount: number,
    totalKeywords: number,
    url: string,
  ): number {
    let score = 0;

    // Region match contribution
    if (regionMatch) {
      score += this.config.regionWeight;
    }

    // Keyword match contribution
    if (totalKeywords > 0) {
      score += this.config.keywordWeight * (matchedKeywordsCount / totalKeywords);
    } else {
      // No keywords to match, give partial credit
      score += this.config.keywordWeight * 0.5;
    }

    // Bonus for official domains
    if (this.isOfficialDomain(url)) {
      score = Math.min(1.0, score + this.config.officialDomainBonus);
    }

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Checks if URL is from an official domain.
   */
  private isOfficialDomain(url: string): boolean {
    const urlLower = url.toLowerCase();
    return OFFICIAL_DOMAINS.some((domain) => urlLower.includes(domain));
  }

  /**
   * Determines if Mistral OCR should be used for a URL.
   * Uses Mistral for scientific/research PDFs.
   */
  private shouldUseMistralOcr(url: string): boolean {
    const urlLower = url.toLowerCase();

    // Scientific repositories and publishers
    const scientificDomains = [
      'sciencedirect',
      'springer',
      'wiley',
      'elsevier',
      'nature.com',
      'researchgate',
      'academia.edu',
      'arxiv',
      'pubmed',
      'ncbi',
      'doi.org',
      'jstor',
    ];

    return scientificDomains.some((domain) => urlLower.includes(domain));
  }

  /**
   * Creates a fallback result when validation fails entirely.
   */
  private createFallbackResult(result: TavilyResult, error: string): ValidatedTavilyResult {
    return {
      original: result,
      isValid: false,
      regionMatch: false,
      keywordMatches: [],
      relevanceScore: 0.1, // Minimal score for unvalidated results
      extractedSnippets: result.content ? [result.content.substring(0, 200)] : [],
      fetchError: error,
    };
  }

  /**
   * Gets statistics about the validation service.
   */
  getStats(): { cacheStats: { size: number; maxSize: number } } {
    return {
      cacheStats: this.contentFetcher.getCacheStats(),
    };
  }

  /**
   * Clears the content cache.
   */
  clearCache(): void {
    this.contentFetcher.clearCache();
  }
}
