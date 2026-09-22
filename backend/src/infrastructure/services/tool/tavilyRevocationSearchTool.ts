import { tavily, type TavilySearchResponse } from '@tavily/core';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { requireConfiguredFeature } from '../../runtime/requireConfiguredFeature';

/**
 * Result of a revocation search for a phytosanitary product.
 */
export interface RevocationSearchResult {
  readonly isRevoked: boolean;
  readonly expirationDate?: string;
  readonly source: string;
  readonly sourceUrl?: string;
  readonly reason?: string;
  readonly confidence: 'high' | 'medium' | 'low';
}

/**
 * Parameters for searching revocation status.
 */
export interface RevocationSearchParams {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly region?: string;
}

const OFFICIAL_DOMAINS = [
  'gov.it',
  'regione.',
  'ministero',
  'sian.it',
  'fitogest.it',
  'salute.gov.it',
  'politicheagricole.it',
];

/**
 * Searches for product revocation status using Tavily API.
 * Queries official Italian government sources for phytosanitary product status.
 *
 * @param params - Search parameters including product name and registration number
 * @returns RevocationSearchResult or null if no information found
 */
export async function searchRevocationStatus(
  params: RevocationSearchParams,
): Promise<RevocationSearchResult | null> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    console.warn('[TAVILY-REVOCATION] TAVILY_API_KEY not configured, skipping search');
    return null;
  }

  const { productName, registrationNumber, region } = params;

  try {
    const client = tavily({ apiKey: tavilyApiKey });

    // Build query targeting official sources for revocation information
    const regionFilter = region ? ` ${region}` : '';
    const query = `"${productName}" OR "numero registrazione ${registrationNumber}" revoca revocato autorizzazione scaduta fitosanitario${regionFilter} site:gov.it OR site:salute.gov.it OR site:sian.it`;

    const response: TavilySearchResponse = await client.search(query, {
      maxResults: 5,
      searchDepth: 'advanced',
      includeAnswer: true,
      includeRawContent: false,
      includeImages: false,
    });

    // Filter to prioritize official sources
    const officialResults = (response.results || []).filter((result: { url: string }) => {
      const urlLower = result.url.toLowerCase();
      return OFFICIAL_DOMAINS.some((domain) => urlLower.includes(domain));
    });

    const resultsToAnalyze = officialResults.length > 0 ? officialResults : response.results || [];

    if (resultsToAnalyze.length === 0) {
      return null;
    }

    // Analyze results for revocation indicators
    const revocationKeywords = [
      'revocato',
      'revoca',
      'non più autorizzato',
      'autorizzazione scaduta',
      'ritirato',
      'sospeso',
      'decaduto',
    ];

    let isRevoked = false;
    let reason: string | undefined;
    let sourceUrl: string | undefined;
    let source = 'Tavily Search';
    let expirationDate: string | undefined;

    for (const result of resultsToAnalyze) {
      const contentLower = result.content.toLowerCase();
      const titleLower = result.title.toLowerCase();

      // Check if content mentions the product and revocation
      const mentionsProduct =
        contentLower.includes(productName.toLowerCase()) ||
        contentLower.includes(registrationNumber);

      const mentionsRevocation = revocationKeywords.some(
        (keyword) => contentLower.includes(keyword) || titleLower.includes(keyword),
      );

      if (mentionsProduct && mentionsRevocation) {
        isRevoked = true;
        sourceUrl = result.url;
        source = result.title;

        // Try to extract date from content (common Italian formats)
        const dateMatch = result.content.match(
          /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})/i,
        );
        if (dateMatch) {
          expirationDate = dateMatch[0];
        }

        // Extract reason from content (first 200 chars after revocation keyword)
        const revocationIndex = revocationKeywords.reduce((minIndex, keyword) => {
          const idx = contentLower.indexOf(keyword);
          return idx !== -1 && (minIndex === -1 || idx < minIndex) ? idx : minIndex;
        }, -1);

        if (revocationIndex !== -1) {
          reason = result.content.substring(revocationIndex, revocationIndex + 200).trim();
        }

        break;
      }
    }

    // Also check the answer summary from Tavily
    if (!isRevoked && response.answer) {
      const answerLower = response.answer.toLowerCase();
      const mentionsRevocation = revocationKeywords.some((keyword) =>
        answerLower.includes(keyword),
      );
      if (mentionsRevocation) {
        isRevoked = true;
        reason = response.answer.substring(0, 200);
        source = 'Tavily Answer Summary';
      }
    }

    if (!isRevoked) {
      return null;
    }

    // Determine confidence based on source quality
    const sourceUrlLower = sourceUrl?.toLowerCase() ?? '';
    const isOfficialSource = sourceUrl
      ? OFFICIAL_DOMAINS.some((domain) => sourceUrlLower.includes(domain))
      : false;

    const confidence: 'high' | 'medium' | 'low' = isOfficialSource ? 'high' : 'medium';

    return {
      isRevoked,
      expirationDate,
      source,
      sourceUrl,
      reason,
      confidence,
    };
  } catch (error) {
    console.warn(
      '[TAVILY-REVOCATION] Search failed:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Creates a LangChain DynamicStructuredTool for revocation search.
 * Can be used in agent workflows.
 */
export const createTavilyRevocationSearchTool = (apiKey?: string) => {
  requireConfiguredFeature('Tavily', apiKey || process.env.TAVILY_API_KEY);

  return new DynamicStructuredTool({
    name: 'search_product_revocation',
    description:
      'Searches official Italian government sources to check if a phytosanitary product has been revoked or if its authorization has expired. Use this tool when you need to verify if a product can still be legally used.',
    schema: z.object({
      productName: z.string().describe('The commercial name of the phytosanitary product'),
      registrationNumber: z.string().describe('The registration number of the product'),
      region: z
        .string()
        .optional()
        .describe('Optional region to narrow the search (e.g., "Emilia-Romagna", "Piemonte")'),
    }),
    func: async ({ productName, registrationNumber, region }) => {
      const result = await searchRevocationStatus({
        productName,
        registrationNumber,
        region,
      });

      if (!result) {
        return `No revocation information found for product "${productName}" (${registrationNumber}). The product may still be authorized, but verify with official sources.`;
      }

      const confidenceText =
        result.confidence === 'high'
          ? '[OFFICIAL SOURCE]'
          : result.confidence === 'medium'
            ? '[LIKELY OFFICIAL]'
            : '[UNVERIFIED]';

      let response = `${confidenceText} Product "${productName}" (${registrationNumber}):\n`;
      response += `Status: ${result.isRevoked ? 'REVOKED/EXPIRED' : 'Unknown'}\n`;

      if (result.expirationDate) {
        response += `Expiration Date: ${result.expirationDate}\n`;
      }

      if (result.reason) {
        response += `Details: ${result.reason}\n`;
      }

      response += `Source: ${result.source}`;
      if (result.sourceUrl) {
        response += ` (${result.sourceUrl})`;
      }

      return response;
    },
  });
};
