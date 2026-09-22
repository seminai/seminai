import { tavily, type TavilySearchResponse } from '@tavily/core';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../repositories/Prisma';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { PrismaDisciplinariExtractionRepository } from '../../../repositories/PrismaDisciplinariExtractionRepository';
import {
  DisciplinariExtractedData,
  DefenseTarget,
  AllowedIntervention,
} from '../../../../domain/dtos/disciplinari.dto';
import {
  TavilyResultValidationService,
  getFieldRegionByJobId,
  extractKeywordsFromQuery,
  TavilyResult,
  ValidatedTavilyResult,
} from './validation';
import { JobOperationsVectorStore, JobOperationSearchResult } from './rag';
import { searchRules } from './helpers/company-rules-search.service';
import { llmMatchAgronomicNames } from '../shared/llmAgronomicMatcher';

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

/**
 * Creates a tool to search vectorized rules across all categories.
 * Supports company-assigned search and explicit workspace exploratory search.
 */
export const createRulesSearchTool = (options: RulesSearchToolOptions) => {
  return new DynamicStructuredTool({
    name: 'search_rules',
    description:
      'Searches vectorized rules (disciplinari, standards, best practices, methodologies, custom rules) ' +
      'available in the workspace.\n' +
      "Quando conosci il companyId dell'azienda su cui stai lavorando, passalo SEMPRE: " +
      "di default cerca SOLO regole ACTIVE assegnate all'azienda. " +
      'Le regole workspace non assegnate sono solo esplorative e vanno incluse solo se richiesto esplicitamente.\n' +
      'Use this tool FIRST for compliance, disciplinary, methodology, standard, and best practice questions.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Specific question about compliance, disciplinare constraints, dosage limits, ' +
            'methodologies, standards, or best practices.',
        ),
      companyId: z
        .string()
        .optional()
        .describe(
          "ID dell'azienda su cui stai lavorando. Se fornito, le regole assegnate a questa azienda " +
            "sono l'unica fonte vincolante di default.",
        ),
      includeWorkspaceExploratory: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Se true include anche regole workspace non assegnate come risultati esplorativi non vincolanti.',
        ),
      categories: z
        .array(z.enum(['DISCIPLINARE', 'STANDARD', 'METHODOLOGY', 'BEST_PRACTICE', 'CUSTOM']))
        .optional()
        .describe('Optional categories filter. Defaults to all vectorizable categories.'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of rule results to return (default: 5, max: 10).'),
    }),
    func: async ({ query, companyId, includeWorkspaceExploratory, categories, limit = 5 }) => {
      try {
        const results = await searchRules({
          jobId: options.jobId,
          workspaceId: options.workspaceId,
          userId: options.userId,
          companyId,
          includeWorkspaceExploratory,
          query,
          categories,
          k: Math.min(limit, 10),
        });
        if (results.length === 0) {
          return `No matching rules found for query "${query}" in the workspace. Consider using search_disciplinari_database for broader disciplinari extraction data.`;
        }
        const formatted = results
          .map((result, index) => {
            const sourceLabel =
              result.source === 'company'
                ? result.isPublic
                  ? 'COMPANY_ASSIGNED_PUBLIC'
                  : 'COMPANY_ASSIGNED_PRIVATE'
                : 'WORKSPACE_EXPLORATORY_NOT_APPLICABLE';
            const scorePercent = Math.round(result.score * 100);
            const chunks = result.chunks
              .map(
                (chunk, chunkIndex) =>
                  `  [CHUNK_${chunkIndex + 1}] (score: ${Math.round(chunk.score * 100)}%)\n  ${chunk.content}`,
              )
              .join('\n');
            return `[RULE_${index + 1}] [${sourceLabel}]
Name: ${result.ruleName}
Category: ${result.ruleCategory}
Rule ID: ${result.ruleId}
Relevance: ${scorePercent}%
Excerpts:
${chunks}
---`;
          })
          .join('\n\n');
        return `RULE SEARCH RESULTS FOR "${query}":

${formatted}

IMPORTANT: Treat [COMPANY_ASSIGNED_PUBLIC] and [COMPANY_ASSIGNED_PRIVATE] rules as applicable to the company. Treat [WORKSPACE_EXPLORATORY_NOT_APPLICABLE] only as non-binding background unless the rule is assigned to the company.`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Error searching rules: ${errorMessage}.`;
      }
    },
  });
};

/**
 * Creates a tool to search in the disciplinari database for compliance information.
 * This tool searches extracted disciplinari data stored in the database.
 */
export const createDisciplinariDatabaseSearchTool = () => {
  const repository = new PrismaDisciplinariExtractionRepository(prisma);

  return new DynamicStructuredTool({
    name: 'search_disciplinari_database',
    description:
      'Searches the database of already extracted disciplinari (regional production guidelines) for information about products, active ingredients, doses, and compliance. Use this tool FIRST when asked about disciplinari compliance, product conformity, or specific regulations. This returns structured data from official documents that have been previously extracted.',
    schema: z.object({
      region: z
        .string()
        .optional()
        .describe(
          'The region to search for (e.g., "Emilia-Romagna", "Piemonte", "Lombardia"). Leave empty to search all regions.',
        ),
      year: z
        .number()
        .optional()
        .describe('The year of the disciplinare (e.g., 2025). Leave empty to search all years.'),
      productName: z
        .string()
        .optional()
        .describe(
          'Product name or active ingredient to search for (e.g., "Captano", "Rame", "Glifosate").',
        ),
      cropName: z
        .string()
        .optional()
        .describe('Crop name to filter by (e.g., "Melo", "Vite", "Pomodoro").'),
      targetName: z
        .string()
        .optional()
        .describe(
          'Target pest/disease to search for (e.g., "Ticchiolatura", "Oidio", "Peronospora").',
        ),
    }),
    func: async ({ region, year, productName, cropName, targetName }) => {
      try {
        let extractions;

        if (region && year) {
          extractions = await repository.findByRegionAndYear(region, year);
        } else if (region) {
          extractions = await prisma.disciplinariExtraction.findMany({
            where: {
              region: { contains: region, mode: 'insensitive' },
            },
            orderBy: { year: 'desc' },
            take: 10,
          });
        } else if (year) {
          extractions = await prisma.disciplinariExtraction.findMany({
            where: { year },
            orderBy: { region: 'asc' },
            take: 10,
          });
        } else {
          extractions = await prisma.disciplinariExtraction.findMany({
            orderBy: [{ year: 'desc' }, { region: 'asc' }],
            take: 10,
          });
        }

        if (extractions.length === 0) {
          return `No disciplinari found in database for the specified criteria (region: ${region ?? 'any'}, year: ${year ?? 'any'}). Try using the tavily_scientific_search tool to find this information online.`;
        }

        const results: string[] = [];

        for (const extraction of extractions) {
          const data = extraction.extractedData as unknown as DisciplinariExtractedData;
          if (!data || !data.defenseTargets) continue;

          // Filter by crop if specified: LLM-based semantic matching against scopeEntities
          if (cropName) {
            const scopeNames = (data.scopeEntities ?? []).flatMap(
              (scope) => [scope.crop.name, scope.crop.group].filter(Boolean) as string[],
            );
            let hasMatchingCrop = false;
            for (const name of scopeNames) {
              const result = await llmMatchAgronomicNames({
                nameA: name,
                nameB: cropName,
                entityType: 'crop',
              });
              if (result.isMatch) {
                hasMatchingCrop = true;
                break;
              }
            }
            if (!hasMatchingCrop) {
              continue; // Skip this extraction if crop doesn't match
            }
          }

          const matchingInterventions: Array<{
            target: string;
            crop: string;
            intervention: AllowedIntervention;
          }> = [];

          // Initialize relevant targets from extracted data
          const relevantTargets: ReadonlyArray<DefenseTarget> = data.defenseTargets;

          // Search for matching products/active ingredients and targets
          for (const target of relevantTargets) {
            // Filter by target name if specified (LLM-based semantic matching)
            if (targetName) {
              const targetMatch = await llmMatchAgronomicNames({
                nameA: target.target.name,
                nameB: targetName,
                entityType: 'adversity',
              });
              if (!targetMatch.isMatch) continue;
            }

            for (const intervention of target.interventions) {
              let productMatch = !productName;
              if (productName && !productMatch) {
                // Check main name
                const nameResult = await llmMatchAgronomicNames({
                  nameA: intervention.productOrActive.name,
                  nameB: productName,
                  entityType: 'product',
                });
                productMatch = nameResult.isMatch;
                // Check normalized name if main didn't match
                if (!productMatch && intervention.productOrActive.normalized) {
                  const normalizedResult = await llmMatchAgronomicNames({
                    nameA: intervention.productOrActive.normalized,
                    nameB: productName,
                    entityType: 'product',
                  });
                  productMatch = normalizedResult.isMatch;
                }
              }

              if (productMatch) {
                matchingInterventions.push({
                  target: target.target.name,
                  crop: cropName ?? 'N/A',
                  intervention,
                });
              }
            }
          }

          if (matchingInterventions.length > 0) {
            results.push(`
=== DISCIPLINARE: ${extraction.region} ${extraction.year} ===
Titolo: ${extraction.title}
Valido fino: ${extraction.validUntil ? new Date(extraction.validUntil).toLocaleDateString('it-IT') : 'Non specificato'}
Scaduto: ${extraction.isExpired ? 'Sì' : 'No'}
Confidenza estrazione: ${extraction.extractionConfidence}%

INTERVENTI TROVATI (${matchingInterventions.length}):
${matchingInterventions
  .slice(0, 20) // Limit to 20 to avoid too long responses
  .map(
    (m, i) => `
${i + 1}. Bersaglio: ${m.target}
   Prodotto/Principio attivo: ${m.intervention.productOrActive.name}${m.intervention.productOrActive.normalized ? ` (${m.intervention.productOrActive.normalized})` : ''}
   Formulazione: ${m.intervention.formulation ?? 'N/A'}
   Dose minima: ${m.intervention.dose.min ?? 'N/A'} ${m.intervention.dose.unit ?? ''}
   Dose massima: ${m.intervention.dose.max ?? 'N/A'} ${m.intervention.dose.unit ?? ''}
   N. max interventi: ${m.intervention.applications.max ?? 'N/A'} per ${m.intervention.applications.scope ?? 'N/A'}
   Intervallo minimo: ${m.intervention.interval.minDays ?? 'N/A'} giorni
   Finestra fenologica: ${m.intervention.phenology.from ?? 'N/A'} - ${m.intervention.phenology.to ?? 'N/A'}
   Vincoli: ${m.intervention.constraints.length > 0 ? m.intervention.constraints.join('; ') : 'Nessuno specificato'}
   Note: ${m.intervention.notes ?? 'Nessuna'}`,
  )
  .join('\n')}
`);
          }
        }

        if (results.length === 0) {
          return `Found ${extractions.length} disciplinari in database but no matching interventions for: product="${productName ?? 'any'}", crop="${cropName ?? 'any'}", target="${targetName ?? 'any'}". Try using the tavily_scientific_search tool to find this information online.`;
        }

        return `DISCIPLINARI DATABASE SEARCH RESULTS:
${results.join('\n---\n')}

NOTE: These are official data extracted from regional disciplinari documents stored in our database. The data is structured and reliable. If you need more information or the data is not sufficient, you can use tavily_scientific_search to find additional official sources online.`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Error searching disciplinari database: ${errorMessage}. Try using tavily_scientific_search instead.`;
      }
    },
  });
};

/**
 * Creates a tool to retrieve job details for the provided user context.
 */
export const createJobDetailsTool = (userId: string) => {
  return new DynamicStructuredTool({
    name: 'get_job_details',
    description:
      'Retrieves the full details for a specific job. Use this tool when you need to understand the context of a specific agricultural job and its current status.',
    schema: z.object({
      jobId: z.string().describe('The ID of the job to retrieve details for.'),
    }),
    func: async ({ jobId }) => {
      try {
        const jobRepository = new PrismaJobRepository(prisma);
        const jobs = await jobRepository.findManyByUserIdWithAssignmentWithoutHistory(
          userId,
          undefined,
          jobId,
        );

        if (jobs.length === 0) {
          return `No job found with ID ${jobId} for the current user.`;
        }

        return JSON.stringify(
          {
            jobs,
          },
          null,
          2,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new Error(`Failed to retrieve job details: ${errorMessage}`);
      }
    },
  });
};

/**
 * Formats search results for the LLM consumption.
 * Includes operation details and relevance score.
 */
function formatSearchResults(results: JobOperationSearchResult[]): string {
  if (results.length === 0) {
    return 'Nessuna operazione trovata che corrisponde alla ricerca.';
  }

  const formattedResults = results.map((result, index) => {
    const { document, score } = result;
    const { metadata } = document;
    const scorePercent = Math.round(score * 100);

    return `[OPERAZIONE ${index + 1}] (Rilevanza: ${scorePercent}%)
ID: ${metadata.operationId}
Data: ${new Date(metadata.dateOfOperation).toLocaleDateString('it-IT')}
Categoria: ${metadata.category}
Coltura: ${metadata.cropName} (${metadata.cropType})
Prodotti: ${metadata.productNames.join(', ') || 'N/A'}
Avversità: ${metadata.avversity || 'N/A'}
Quantità: ${metadata.quantity} ${metadata.unitOfMeasure}
Campi: ${metadata.fieldNames.join(', ')}
Azienda: ${metadata.companyName}

Dettagli:
${document.content}
---`;
  });

  return `RISULTATI RICERCA OPERAZIONI (${results.length} trovate):

${formattedResults.join('\n\n')}

NOTA: Questi risultati sono ordinati per rilevanza semantica rispetto alla query.`;
}

/**
 * Creates a tool for semantic search over job operations.
 * This tool uses vector embeddings to find relevant operations
 * based on natural language queries.
 *
 * @param vectorStore - The initialized JobOperationsVectorStore
 */
export const createJobOperationsSearchTool = (vectorStore: JobOperationsVectorStore) => {
  return new DynamicStructuredTool({
    name: 'search_job_operations',
    description: `Cerca tra le operazioni del job corrente usando ricerca semantica.
Usa questo strumento per trovare operazioni specifiche basandoti su:
- Nome del prodotto o principio attivo (es. "rame", "captano", "glifosate")
- Data o periodo (es. "gennaio", "primavera", "ultima settimana")
- Tipo di avversità o malattia (es. "ticchiolatura", "peronospora")
- Tipo di operazione (es. "trattamento", "fertilizzazione")
- Nome del campo o azienda

Esempi di query:
- "trattamenti con rame"
- "operazioni di gennaio 2025"
- "trattamenti contro ticchiolatura"
- "ultimi trattamenti fitosanitari"
- "fertilizzazioni sul campo Vigna Alta"

IMPORTANTE: Usa questo strumento invece di get_job_details quando vuoi cercare operazioni specifiche.`,
    schema: z.object({
      query: z
        .string()
        .describe('La query di ricerca in linguaggio naturale. Può essere in italiano o inglese.'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Numero massimo di risultati da restituire (default: 5, max: 10)'),
    }),
    func: async ({ query, limit = 5 }) => {
      try {
        const results = await vectorStore.search(query, Math.min(limit, 10));
        return formatSearchResults(results);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Errore durante la ricerca: ${errorMessage}`;
      }
    },
  });
};
