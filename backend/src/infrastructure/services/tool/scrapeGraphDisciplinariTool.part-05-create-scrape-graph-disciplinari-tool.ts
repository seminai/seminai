import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DisciplinariExtractionCategory } from '../integrations/scrapegraph';
import { extractDisciplinariFromUrl } from './scrapeGraphDisciplinariTool.part-04-extract-disciplinari-from-url';

// ============================================================
// LangChain Tool Wrapper
// ============================================================

/**
 * Creates a LangChain DynamicStructuredTool for disciplinari extraction
 */
export const createScrapeGraphDisciplinariTool = (apiKey?: string) => {
  const scrapeGraphApiKey = apiKey ?? process.env.SCRAPERGRAPH_API_KEY;

  if (!scrapeGraphApiKey) {
    throw new Error('SCRAPERGRAPH_API_KEY environment variable is required');
  }

  return new DynamicStructuredTool({
    name: 'extract_disciplinari_from_url',
    description: `Extracts structured data from Italian regional disciplinari (agricultural regulations) web pages using AI-powered web scraping.

Use this tool when you need to:
- Extract metadata (region, year, validity dates) from disciplinari URLs
- Get allowed treatments and interventions for specific crops
- Find rules, prohibitions, and mandatory actions
- Identify pest/disease targets and their treatments

The tool automatically categorizes the type of data based on the URL content.`,

    schema: z.object({
      url: z.string().url().describe('The URL of the disciplinari web page to extract data from'),
      region: z.string().optional().describe('Optional region hint (e.g., "Emilia-Romagna")'),
      year: z.number().optional().describe('Optional year hint (e.g., 2025)'),
      category: z
        .enum(['metadata', 'rules', 'defense_targets', 'interventions', 'scope_entities'])
        .optional()
        .describe('Optional category to focus extraction on'),
      saveToDatabase: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to save the extraction to the database'),
    }),

    func: async ({ url, region, year, category, saveToDatabase }) => {
      const result = await extractDisciplinariFromUrl({
        url,
        region,
        year,
        category: category as DisciplinariExtractionCategory | undefined,
        saveToDatabase,
      });

      if (!result.success) {
        return `Extraction failed for URL "${url}": ${result.error}`;
      }

      const summary: string[] = [
        `[${result.category.toUpperCase()}] Extraction successful (confidence: ${result.confidence}%)`,
        `Source: ${result.sourceUrl}`,
      ];

      if (result.databaseId) {
        summary.push(`Database ID: ${result.databaseId}`);
      }

      switch (result.category) {
        case 'metadata':
          if (result.data.documentMetadata) {
            const m = result.data.documentMetadata;
            summary.push(`Region: ${m.region}, Year: ${m.year}`);
            summary.push(`Title: ${m.title}`);
            if (m.validUntil) {
              summary.push(`Valid until: ${m.validUntil} (${m.isExpired ? 'EXPIRED' : 'active'})`);
            }
          }
          break;

        case 'rules':
          if (result.data.rules) {
            const r = result.data.rules;
            summary.push(`Principles: ${r.generalPrinciples.length}`);
            summary.push(`Prohibitions: ${r.prohibitions.length}`);
            summary.push(`Mandatory actions: ${r.mandatoryActions.length}`);
          }
          break;

        case 'defense_targets':
          if (result.data.defenseTargets) {
            summary.push(`Defense targets: ${result.data.defenseTargets.length}`);
            const totalInterventions = result.data.defenseTargets.reduce(
              (sum, t) => sum + t.interventions.length,
              0,
            );
            summary.push(`Total interventions: ${totalInterventions}`);
          }
          break;

        case 'scope_entities':
          if (result.data.scopeEntities) {
            summary.push(`Scope entities (crops): ${result.data.scopeEntities.length}`);
          }
          break;
      }

      return summary.join('\n');
    },
  });
};
