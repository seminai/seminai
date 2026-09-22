import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { tavily, type TavilySearchResponse } from '@tavily/core';
import { prisma } from '../../../repositories/Prisma';
import { requireConfiguredFeature } from '../../../runtime/requireConfiguredFeature';
import { getLabelTextFromPdfUrl } from '../../tool/getLabelDataFromPdfUrl';
import { extractStructuredTreatmentData } from '../../tool/extractDataFromLabel';

/**
 * Creates a Tavily search tool for general web search.
 */
export const createTavilySearchTool = (apiKey?: string) => {
  const tavilyApiKey = requireConfiguredFeature(
    'Tavily',
    apiKey || process.env.TAVILY_API_KEY,
  );

  return new DynamicStructuredTool({
    name: 'tavily_search',
    description:
      'Searches the web for information about agricultural practices, regulations, products, and best practices. Use this for general queries about treatments, dosages, regulations, or any agricultural topic.',
    schema: z.object({
      query: z.string().describe('The search query. Be specific and include relevant terms.'),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of results to return (default: 5, max: 10)'),
    }),
    func: async ({ query, maxResults = 5 }) => {
      try {
        const client = tavily({ apiKey: tavilyApiKey });
        const response: TavilySearchResponse = await client.search(query, {
          maxResults: Math.min(maxResults, 10),
          searchDepth: 'advanced',
          includeAnswer: true,
          includeRawContent: false,
          includeImages: false,
        });

        const formattedResults = (response.results || [])
          .map((result: { title: string; url: string; content: string }, index: number) => {
            const fragment = result.content.substring(0, 300).trim();
            return `[SOURCE_${index + 1}]
Title: ${result.title}
URL: ${result.url}
Content: ${result.content}
Fragment: ${fragment}
---`;
          })
          .join('\n\n');

        const answer = response.answer ? `\n\nSummary Answer: ${response.answer}` : '';

        return `Search Results for "${query}":\n\n${formattedResults}${answer}\n\nIMPORTANT: When reporting information from these sources, include the URL and title in your sources array.`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(`Tavily search failed: ${errorMessage}`);
      }
    },
  });
};

/**
 * Normalizes a registration number by removing leading zeros.
 */
export function normalizeRegistrationNumber(regNumber: string): string {
  return regNumber.replace(/^0+/, '') || '0';
}

/**
 * Creates a tool to extract data from phytosanitary product labels.
 * First checks database for existing extraction, then falls back to SIAN.
 */
export const createLabelExtractionTool = (userId?: string) => {
  return new DynamicStructuredTool({
    name: 'extract_label_data',
    description:
      'Extracts structured data from a phytosanitary product label. Use this when you need detailed dosage information, application instructions, safety intervals, or restrictions for a specific product. Requires the product name and registration number.',
    schema: z.object({
      productName: z.string().describe('The commercial name of the product'),
      registrationNumber: z
        .string()
        .describe('The registration number of the product (e.g., "12345")'),
    }),
    func: async ({ productName, registrationNumber }) => {
      try {
        const normalizedRegNumber = normalizeRegistrationNumber(registrationNumber);
        const normalizedProductName = productName.toUpperCase().trim();

        // First, check if label extraction already exists in database
        const existingExtraction = await prisma.labelExtraction.findFirst({
          where: {
            isArchived: false,
            OR: [
              {
                productName: { equals: normalizedProductName, mode: 'insensitive' },
                registrationNumber: normalizedRegNumber,
              },
              {
                productName: { equals: normalizedProductName, mode: 'insensitive' },
                registrationNumber: registrationNumber,
              },
              {
                productName: { equals: productName, mode: 'insensitive' },
                registrationNumber: normalizedRegNumber,
              },
              {
                productName: { equals: productName, mode: 'insensitive' },
                registrationNumber: registrationNumber,
              },
            ],
          },
        });

        if (existingExtraction) {
          console.log(
            `[LABEL_EXTRACTION_TOOL] Found existing extraction for ${productName} (Reg: ${registrationNumber}) in database`,
          );

          return JSON.stringify(
            {
              source: {
                url: existingExtraction.sourceUrl,
                title: `Etichetta ${existingExtraction.productName}`,
                description: `Etichetta ufficiale del prodotto ${existingExtraction.productName} (Reg: ${existingExtraction.registrationNumber}) - Dati da database`,
              },
              data: existingExtraction.label,
              rawText: existingExtraction.rawText,
              fromCache: true,
              extractionConfidence: existingExtraction.extractionConfidence,
              isVerified: existingExtraction.isVerified,
            },
            null,
            2,
          );
        }

        console.log(
          `[LABEL_EXTRACTION_TOOL] No existing extraction found for ${productName} (Reg: ${registrationNumber}), fetching from SIAN`,
        );

        // Fall back to fetching from SIAN
        const labelResult = await getLabelTextFromPdfUrl(productName, registrationNumber, {
          userId: userId || 'agent',
          jobId: 'job-verification-agent',
        });

        if (!labelResult || !labelResult.text) {
          return `Could not retrieve label for product "${productName}" (Reg: ${registrationNumber}). The label might not be available online.`;
        }

        const structuredData = await extractStructuredTreatmentData(labelResult.text, undefined, {
          userId: userId || 'agent',
          jobId: 'job-verification-agent',
        });

        return JSON.stringify(
          {
            source: {
              url: labelResult.url,
              title: `Etichetta ${productName}`,
              description: `Etichetta ufficiale del prodotto ${productName} (Reg: ${registrationNumber})`,
            },
            data: structuredData,
            fromCache: false,
          },
          null,
          2,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Failed to extract label data: ${errorMessage}`;
      }
    },
  });
};
