import { createScrapeGraphClient } from '../integrations/scrapegraph';
import type { DisciplinariExtractedData, DisciplinariMetadata, DisciplinariRules, DefenseTarget, ScopeEntity } from '../../../domain/dtos/disciplinari.dto';
import { EXTRACTION_PROMPTS, ScrapeGraphExtractionParams, ScrapeGraphExtractionResult } from './scrapeGraphDisciplinariTool.part-01-scrape-graph-extraction-params';
import { detectCategoryFromUrl, getOutputSchemaForCategory, mapToMetadata } from './scrapeGraphDisciplinariTool.part-02-get-output-schema-for-category';
import { mapInterventionFromRaw, mapToDefenseTargets, mapToRules, mapToScopeEntities, saveToDatabase } from './scrapeGraphDisciplinariTool.part-03-map-to-rules';

// ============================================================
// Main Extraction Function
// ============================================================

/**
 * Extracts disciplinari data from a URL using ScrapeGraph AI
 */
export async function extractDisciplinariFromUrl(
  params: ScrapeGraphExtractionParams,
): Promise<ScrapeGraphExtractionResult> {
  const apiKey = process.env.SCRAPERGRAPH_API_KEY;

  if (!apiKey) {
    console.warn('[SCRAPEGRAPH] SCRAPERGRAPH_API_KEY not configured');
    return {
      success: false,
      category: params.category ?? 'metadata',
      data: {},
      confidence: 0,
      sourceUrl: params.url,
      error: 'SCRAPERGRAPH_API_KEY not configured',
    };
  }

  const client = createScrapeGraphClient(apiKey);
  const category = params.category ?? detectCategoryFromUrl(params.url);
  const prompt = EXTRACTION_PROMPTS[category];
  const outputSchema = getOutputSchemaForCategory(category);

  try {
    console.log(`[SCRAPEGRAPH] Extracting ${category} from: ${params.url}`);

    const response = await client.smartScrape({
      website_url: params.url,
      user_prompt: prompt,
      output_schema: outputSchema,
    });

    // ScrapeGraph API can return either:
    // 1. Direct result object (most common)
    // 2. Wrapper with { status, result, error }
    // Handle both cases
    const isWrapper =
      response &&
      typeof response === 'object' &&
      ('status' in response || 'result' in response || 'request_id' in response);

    let extractedResult: unknown;

    if (isWrapper) {
      // It's a wrapper response
      const wrapper = response as { status?: string; result?: unknown; error?: string };
      if (wrapper.status === 'failed' || (wrapper.status && !wrapper.result)) {
        return {
          success: false,
          category,
          data: {},
          confidence: 0,
          sourceUrl: params.url,
          error: wrapper.error ?? 'Extraction failed',
        };
      }
      extractedResult = wrapper.result ?? response;
    } else {
      // It's a direct result
      extractedResult = response;
    }

    console.log(
      '[SCRAPEGRAPH] Extracted result:',
      JSON.stringify(extractedResult, null, 2).substring(0, 500),
    );

    if (
      !extractedResult ||
      (typeof extractedResult === 'object' && Object.keys(extractedResult).length === 0)
    ) {
      return {
        success: false,
        category,
        data: {},
        confidence: 0,
        sourceUrl: params.url,
        error: 'No data extracted from page',
      };
    }

    // Map extracted data to DTOs based on category
    // Use mutable object and cast at the end
    let documentMetadata: DisciplinariMetadata | undefined;
    let rules: DisciplinariRules | undefined;
    let defenseTargets: DefenseTarget[] | undefined;
    let scopeEntities: ScopeEntity[] | undefined;
    let confidence = 70;

    switch (category) {
      case 'metadata': {
        const metadata = mapToMetadata(extractedResult);
        if (metadata) {
          documentMetadata = metadata;
          confidence = metadata.region !== 'Unknown' ? 85 : 60;
        }
        break;
      }

      case 'rules': {
        const rulesData = mapToRules(extractedResult);
        if (rulesData) {
          rules = rulesData;
          confidence = rulesData.generalPrinciples.length > 0 ? 80 : 60;
        }
        break;
      }

      case 'defense_targets': {
        defenseTargets = mapToDefenseTargets(extractedResult);
        confidence = defenseTargets.length > 0 ? 85 : 50;
        break;
      }

      case 'interventions': {
        const interventions = Array.isArray(extractedResult) ? extractedResult : [];
        defenseTargets = [
          {
            target: { name: 'Generale', type: 'altro' },
            monitoring: [],
            agronomicMeasures: [],
            biologicalMeasures: [],
            interventions: interventions.map(mapInterventionFromRaw),
          },
        ];
        confidence = interventions.length > 0 ? 80 : 50;
        break;
      }

      case 'scope_entities': {
        scopeEntities = mapToScopeEntities(extractedResult);
        confidence = scopeEntities.length > 0 ? 80 : 50;
        break;
      }
    }

    // Build extracted data object
    const extractedData: Partial<DisciplinariExtractedData> = {
      ...(documentMetadata && { documentMetadata }),
      ...(rules && { rules }),
      ...(defenseTargets && { defenseTargets }),
      ...(scopeEntities && { scopeEntities }),
    };

    // Save to database if requested
    let databaseId: string | undefined;
    if (params.saveToDatabase && extractedData.documentMetadata) {
      databaseId = await saveToDatabase(params.url, extractedData, confidence, params.userId);
    }

    console.log(`[SCRAPEGRAPH] Successfully extracted ${category} with confidence ${confidence}%`);

    return {
      success: true,
      category,
      data: extractedData,
      confidence,
      sourceUrl: params.url,
      databaseId,
    };
  } catch (error) {
    console.error('[SCRAPEGRAPH] Extraction failed:', error);
    return {
      success: false,
      category,
      data: {},
      confidence: 0,
      sourceUrl: params.url,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
