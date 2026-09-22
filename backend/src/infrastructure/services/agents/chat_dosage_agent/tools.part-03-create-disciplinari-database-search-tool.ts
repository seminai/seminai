import { PrismaDisciplinariExtractionRepository } from '../../../repositories/PrismaDisciplinariExtractionRepository';
import { prisma } from '../../../repositories/Prisma';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DisciplinariExtractedData, DefenseTarget, AllowedIntervention } from '../../../../domain/dtos/disciplinari.dto';
import { llmMatchAgronomicNames } from '../shared/llmAgronomicMatcher';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';

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
