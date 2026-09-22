import { TavilyResultValidationService, getFieldRegionByJobId, extractKeywordsFromQuery, TavilyResult, ValidatedTavilyResult } from './validation';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { tavily, type TavilySearchResponse } from '@tavily/core';

/**
 * Creates a Tavily search tool configured for official sources only.
 * This tool searches in official registries, regulations, and labels.
 * When jobId is provided, results are validated against the job's geographic region
 * and keywords are extracted from the query for relevance scoring.
 *
 * @param apiKey - Optional Tavily API key (defaults to TAVILY_API_KEY env var)
 * @param jobId - Optional job ID for geographic and keyword validation
 */
export const createTavilyScientificSearchTool = (apiKey?: string, jobId?: string) => {
  const tavilyApiKey = apiKey || process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    throw new Error('TAVILY_API_KEY environment variable is required');
  }

  // Initialize validation service if jobId is provided
  const validationService = jobId ? new TavilyResultValidationService() : null;

  return new DynamicStructuredTool({
    name: 'tavily_scientific_search',
    description:
      'Searches for OFFICIAL information from government sites, regional disciplinari, official registries, and official product labels. Use this tool when you need accurate, official information about agricultural practices, crop treatments, dosages, phytosanitary products, or compliance with regulations.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'The search query. Be specific and include terms that help find official sources (e.g., "disciplinare produzione integrata", "etichetta ufficiale", "registro fitosanitari", "numero massimo applicazioni").',
        ),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of results to return (default: 5, max: 10)'),
    }),
    func: async ({ query, maxResults = 5 }) => {
      try {
        const client = tavily({ apiKey: tavilyApiKey });

        // Enhance query to prioritize official sources and exclude blogs/forums
        const enhancedQuery = `${query} site:gov.it OR site:regione.*.it OR "disciplinare" OR "regolamento ufficiale" OR "etichetta ufficiale" OR "registro fitosanitari" -blog -forum -"opinione" -"recensione"`;

        const response: TavilySearchResponse = await client.search(enhancedQuery, {
          maxResults: Math.min(maxResults, 10),
          searchDepth: 'advanced',
          includeAnswer: true,
          includeRawContent: false,
          includeImages: false,
        });

        const officialDomains = [
          'gov.it',
          'regione.',
          'ministero',
          'sian',
          'fitogest',
          'registro',
          'disciplinare',
          'regolamento',
        ];
        const filteredResults = (response.results || []).filter((result: { url: string }) => {
          const urlLower = result.url.toLowerCase();
          return officialDomains.some((domain) => urlLower.includes(domain));
        });
        const resultsToUse = filteredResults.length > 0 ? filteredResults : response.results || [];

        // Convert to TavilyResult format for validation
        let finalResults: Array<TavilyResult & { _validation?: ValidatedTavilyResult }> =
          resultsToUse.map(
            (r: { title: string; url: string; content: string; score?: number }) => ({
              title: r.title,
              url: r.url,
              content: r.content,
              score: r.score,
            }),
          );

        // Validate results if jobId is available
        let validationInfo = '';
        if (validationService && jobId) {
          try {
            // Get region from job's fields
            const region = await getFieldRegionByJobId(jobId);
            // Extract keywords from the query
            const keywords = extractKeywordsFromQuery(query);

            if (region || keywords.length > 0) {
              console.log(
                `[TavilySearch] Validating ${finalResults.length} results for region="${region}", keywords=${JSON.stringify(keywords)}`,
              );

              const validatedResults = await validationService.validateResults(finalResults, {
                region,
                keywords,
                jobId,
              });

              // Attach validation info to results
              const validatedMap = new Map(validatedResults.map((v) => [v.original.url, v]));
              finalResults = finalResults.map((r) => ({
                ...r,
                _validation: validatedMap.get(r.url),
              }));

              // Sort by validation score
              finalResults.sort((a, b) => {
                const scoreA = a._validation?.relevanceScore ?? 0;
                const scoreB = b._validation?.relevanceScore ?? 0;
                return scoreB - scoreA;
              });

              // Filter out low-scoring results (keep at least 2)
              const highScoringResults = finalResults.filter(
                (r) => (r._validation?.relevanceScore ?? 0) >= 0.3,
              );
              if (highScoringResults.length >= 2) {
                finalResults = highScoringResults;
              }

              validationInfo = `\n\n[VALIDATION] Results validated against job context. Region: ${region ?? 'not specified'}. Keywords: ${keywords.join(', ') || 'none extracted'}.`;
            }
          } catch (validationError) {
            console.error(
              '[TavilySearch] Validation failed, using unvalidated results:',
              validationError,
            );
            validationInfo = '\n\n[VALIDATION] Validation skipped due to error.';
          }
        }

        // Format the response for the agent with structured information
        // Include URL and content fragments for citation
        const formattedResults = finalResults
          .map((result, index: number) => {
            // Extract first 200 characters as a representative fragment
            const fragment = result.content.substring(0, 200).trim();
            const isOfficial = officialDomains.some((domain) =>
              result.url.toLowerCase().includes(domain),
            );

            // Add validation info if available
            const validation = result._validation;
            let validationStr = '';
            if (validation) {
              const scorePercent = Math.round(validation.relevanceScore * 100);
              validationStr = `
                        Validation Score: ${scorePercent}%
                        Region Match: ${validation.regionMatch ? 'Yes' : 'No'}
                        Keywords Found: ${validation.keywordMatches.length > 0 ? validation.keywordMatches.join(', ') : 'None'}`;
              if (validation.extractedSnippets.length > 0) {
                validationStr += `
                        Relevant Excerpt: "${validation.extractedSnippets[0].substring(0, 150)}..."`;
              }
              if (validation.fetchError) {
                validationStr += `
                        Note: ${validation.fetchError}`;
              }
            }

            return `[SOURCE_${index + 1}]${isOfficial ? ' [OFFICIAL]' : ''}${validation && validation.relevanceScore >= 0.7 ? ' [VALIDATED]' : ''}
                        Title: ${result.title}
                        URL: ${result.url}
                        Content: ${result.content}
                        Fragment: ${fragment}${validationStr}
                        ---`;
          })
          .join('\n\n');

        const answer = response.answer ? `\n\nSummary Answer: ${response.answer}` : '';
        const warning =
          filteredResults.length === 0
            ? '\n\nWARNING: No official sources found. Results may include non-official sources.'
            : '';

        return `Search Results for "${query}":\n\n${formattedResults}${answer}${warning}${validationInfo}\n\nIMPORTANT: When using information from these sources, you MUST include the URL and a brief fragment explaining which part of the text you used. Format citations as: [Title](URL) - "fragment text". Prefer [OFFICIAL] and [VALIDATED] sources when available.`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(`Tavily search failed: ${errorMessage}`);
      }
    },
  });
};

/**
 * Options for creating the rules search tool.
 */
export interface RulesSearchToolOptions {
  readonly jobId?: string;
  readonly workspaceId?: string;
  readonly userId?: string;
}
