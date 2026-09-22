import { tavily, type TavilySearchResponse } from '@tavily/core';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../repositories/Prisma';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { getLabelTextFromPdfUrl } from '../../tool/getLabelDataFromPdfUrl';
import { extractStructuredTreatmentData } from '../../tool/extractDataFromLabel';
import { getDisciplinariFromBDF } from '../../tool/getDisciplinariFromBDF';
import {
  createVectorSearchQdrantService,
  VectorSearchQdrantService,
} from '../../tool/vectorSearchQdrant';

/**
 * Creates a Tavily search tool for general web search.
 */
export const createTavilySearchTool = (apiKey?: string) => {
  const tavilyApiKey = apiKey || process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    throw new Error('TAVILY_API_KEY environment variable is required');
  }

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
function normalizeRegistrationNumber(regNumber: string): string {
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

/**
 * Creates a tool to search disciplinari (regional regulations) from BDF dataset.
 */
export const createDisciplinariSearchTool = () => {
  return new DynamicStructuredTool({
    name: 'search_disciplinari',
    description:
      'Searches regional disciplinari (agricultural regulations) for a specific product. Use this to verify if a product/treatment is allowed according to regional integrated production guidelines.',
    schema: z.object({
      productName: z.string().describe('The commercial name of the product'),
      registrationNumber: z
        .string()
        .describe('The registration number of the product (e.g., "12345")'),
    }),
    func: async ({ productName, registrationNumber }) => {
      try {
        const results = await getDisciplinariFromBDF({
          productName,
          registrationNumber,
        });

        if (results.length === 0) {
          return `No disciplinari entries found for product "${productName}" (Reg: ${registrationNumber}).`;
        }

        return JSON.stringify(
          {
            count: results.length,
            entries: results.map((entry) => ({
              name: entry.name,
              registrationNumber: entry.registrationNumber,
              area: entry.area,
              data: entry.data,
            })),
          },
          null,
          2,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Failed to search disciplinari: ${errorMessage}`;
      }
    },
  });
};

/**
 * Creates a tool for vector search on documents (labels, technical sheets, etc.)
 */
export const createVectorSearchTool = () => {
  let vectorService: VectorSearchQdrantService | null = null;

  return new DynamicStructuredTool({
    name: 'vector_search_documents',
    description:
      'Performs semantic search on indexed documents (labels, technical sheets, regulations). Use this to find relevant information across all stored documents.',
    schema: z.object({
      query: z.string().describe('The semantic search query'),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of results to return (default: 5)'),
    }),
    func: async ({ query, maxResults = 5 }) => {
      try {
        if (!vectorService) {
          vectorService = createVectorSearchQdrantService('phytosanitary_labels');
        }

        const results = await vectorService.similaritySearchWithScore(query, maxResults);

        if (results.length === 0) {
          return 'No relevant documents found for the query.';
        }

        const formattedResults = results.map(([doc, score], index) => ({
          index: index + 1,
          score: score.toFixed(4),
          content: doc.pageContent,
          source: doc.metadata?.source || 'Unknown',
        }));

        return JSON.stringify(formattedResults, null, 2);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Vector search failed: ${errorMessage}`;
      }
    },
  });
};

/**
 * Creates a tool to get detailed job information.
 */
export const createJobDetailsTool = (userId: string) => {
  return new DynamicStructuredTool({
    name: 'get_job_details',
    description:
      'Retrieves detailed information about a specific job including its history, related products, and production unit details.',
    schema: z.object({
      jobId: z.string().describe('The ID of the job to retrieve details for'),
    }),
    func: async ({ jobId }) => {
      try {
        const jobRepository = new PrismaJobRepository(prisma);
        const jobs = await jobRepository.findManyByUserIdWithAssignment(userId, undefined, jobId);

        if (jobs.length === 0) {
          return `No job found with ID "${jobId}" for the current user.`;
        }

        return JSON.stringify(jobs[0], null, 2);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Failed to retrieve job details: ${errorMessage}`;
      }
    },
  });
};

/**
 * Truncates a value for compact output
 */
function truncateValue(value: unknown, maxLength: number = 200): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > maxLength ? value.substring(0, maxLength) + '...[truncated]' : value;
  }
  if (Array.isArray(value)) {
    // For arrays, limit elements and truncate each
    const limitedArray = value.slice(0, 5).map((item) => truncateValue(item, maxLength / 2));
    if (value.length > 5) {
      limitedArray.push({ _remaining: value.length - 5 });
    }
    return limitedArray;
  }
  if (typeof value === 'object') {
    // For objects, truncate nested values
    const result: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>);
    for (const key of keys.slice(0, 10)) {
      result[key] = truncateValue((value as Record<string, unknown>)[key], maxLength / 2);
    }
    if (keys.length > 10) {
      result._remainingKeys = keys.length - 10;
    }
    return result;
  }
  return value;
}

/**
 * Creates a tool to inspect nested job data structures.
 * This allows the agent to explore alertNotes, history, and other nested objects.
 * Returns COMPACT results to avoid context overflow.
 */
export const createInspectJobDataTool = (jobs: { job: Record<string, unknown> }[]) => {
  return new DynamicStructuredTool({
    name: 'inspect_job_data',
    description: `Ispeziona i dati annidati di un job specifico. Usa questo tool per esplorare:
- alertNotes: contiene dati estratti dall'etichetta (dose_minima, dose_massima, resistenze, frasi_pericolo, note_tecniche, etc.)
- history: array con la cronologia delle decisioni prese (crop_matching, dosage_scheduling, dosage_optimization)
- note: reasoning del calcolo della dose
Questo tool è ESSENZIALE per rispondere a domande sul calcolo delle quantità e sulle decisioni prese.
NOTA: I risultati sono troncati per efficienza. Per dati completi, richiedi path specifici.`,
    schema: z.object({
      jobId: z.string().describe("L'ID del job da ispezionare"),
      path: z
        .string()
        .describe(
          'Il path da esplorare, es: "alertNotes", "history", "alertNotes.resistenze", "history[0].metadata"',
        ),
    }),
    func: async ({ jobId, path }) => {
      try {
        const jobData = jobs.find((j) => j.job.id === jobId);
        if (!jobData) {
          return `Job con ID "${jobId}" non trovato. ID disponibili: ${jobs.map((j) => j.job.id).join(', ')}`;
        }

        // Navigate to the path
        const parts = path.split('.');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let current: any = jobData.job;

        for (const part of parts) {
          if (current === undefined || current === null) {
            return `Path "${path}" non trovato. Il valore è undefined/null a "${part}"`;
          }

          // Handle array indexing like "history[0]"
          const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
          if (arrayMatch) {
            const [, arrayName, indexStr] = arrayMatch;
            const index = parseInt(indexStr, 10);
            if (!current[arrayName] || !Array.isArray(current[arrayName])) {
              return `"${arrayName}" non è un array nel path "${path}"`;
            }
            current = current[arrayName][index];
          } else {
            current = current[part];
          }
        }

        if (current === undefined) {
          // List available keys at parent level
          const parentParts = parts.slice(0, -1);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let parent: any = jobData.job;
          for (const part of parentParts) {
            const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
            if (arrayMatch) {
              const [, arrayName, indexStr] = arrayMatch;
              parent = parent[arrayName][parseInt(indexStr, 10)];
            } else {
              parent = parent[part];
            }
          }
          const availableKeys = parent && typeof parent === 'object' ? Object.keys(parent) : [];
          return `Path "${path}" non trovato. Chiavi disponibili: ${availableKeys.join(', ')}`;
        }

        // Format the result with truncation for large values
        const truncatedValue = truncateValue(current, 300);

        const result = {
          path,
          type: Array.isArray(current) ? 'array' : typeof current,
          value: truncatedValue,
          ...(Array.isArray(current) && { length: current.length }),
          ...(typeof current === 'object' &&
            current !== null &&
            !Array.isArray(current) && {
              keys: Object.keys(current),
            }),
        };

        return JSON.stringify(result, null, 2);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return `Errore nell'ispezione: ${errorMessage}`;
      }
    },
  });
};

/**
 * Creates a tool to get a COMPACT summary of available data paths in a job.
 * Returns only key paths to minimize context usage.
 */
export const createListJobPathsTool = (jobs: { job: Record<string, unknown> }[]) => {
  return new DynamicStructuredTool({
    name: 'list_job_paths',
    description:
      "Elenca i path principali disponibili in un job. Ritorna una SINTESI compatta. Usa 'inspect_job_data' per i dettagli specifici.",
    schema: z.object({
      jobId: z.string().describe("L'ID del job da esplorare"),
    }),
    func: async ({ jobId }) => {
      const jobData = jobs.find((j) => j.job.id === jobId);
      if (!jobData) {
        return `Job con ID "${jobId}" non trovato. ID disponibili: ${jobs.map((j) => j.job.id).join(', ')}`;
      }

      const job = jobData.job;

      // Build a compact summary of key paths only
      const keyPaths: string[] = [];
      const summary: Record<string, string> = {};

      // Check for note
      if (job.note) {
        keyPaths.push('note');
        const noteStr = String(job.note);
        summary.note = noteStr.length > 100 ? noteStr.substring(0, 100) + '...' : noteStr;
      }

      // Check for alertNotes
      if (job.alertNotes && typeof job.alertNotes === 'object') {
        const alertKeys = Object.keys(job.alertNotes as Record<string, unknown>);
        keyPaths.push('alertNotes');
        summary.alertNotes = `Campi: ${alertKeys.slice(0, 8).join(', ')}${alertKeys.length > 8 ? ` (+${alertKeys.length - 8} altri)` : ''}`;
      }

      // Check for history
      if (job.history && Array.isArray(job.history)) {
        const historyArr = job.history as Array<{ step?: string; title?: string }>;
        keyPaths.push('history');
        summary.history = `${historyArr.length} voci: ${historyArr
          .slice(0, 3)
          .map((h) => h.step || h.title || '?')
          .join(', ')}${historyArr.length > 3 ? '...' : ''}`;
      }

      // Add other important scalar fields
      const importantFields = [
        'quantity',
        'treatedSurface',
        'category',
        'isVerified',
        'conformityChecked',
      ];
      for (const field of importantFields) {
        if (job[field] !== undefined && job[field] !== null) {
          keyPaths.push(field);
          summary[field] = String(job[field]).substring(0, 50);
        }
      }

      return JSON.stringify({
        jobId,
        keyPaths,
        summary,
        hint: "Usa inspect_job_data con path specifici (es. 'note', 'alertNotes', 'history') per dettagli",
      });
    },
  });
};

/**
 * Creates a tool to propose job modifications (requires human approval).
 */
export const createProposeJobModificationTool = () => {
  return new DynamicStructuredTool({
    name: 'propose_job_modification',
    description:
      'Proposes a modification to a job field. This will require user approval before being applied. Use this when the user asks to change job data. IMPORTANT: After proposing a modification, the job will be marked as conformityChecked=false.',
    schema: z.object({
      jobId: z.string().describe('The ID of the job to modify'),
      field: z
        .string()
        .describe('The field name to modify (e.g., "quantity", "note", "avversity")'),
      oldValue: z.string().describe('The current value of the field (for reference)'),
      newValue: z.string().describe('The new value to set'),
      reason: z.string().describe('The reason for this modification'),
    }),
    func: async ({ jobId, field, oldValue, newValue, reason }) => {
      // This tool doesn't actually modify the job - it just returns the proposed modification
      // The actual modification will be done after user approval
      return JSON.stringify(
        {
          type: 'MODIFICATION_PROPOSAL',
          jobId,
          field,
          oldValue,
          newValue,
          reason,
          warning:
            'This modification requires user approval. After approval, the job will be marked as conformityChecked=false.',
        },
        null,
        2,
      );
    },
  });
};

/**
 * Helper function to extract sources from tool message content
 */
export function extractSourcesFromToolContent(content: string): Array<{
  url: string;
  title: string;
  description: string;
}> {
  const sources: Array<{ url: string; title: string; description: string }> = [];

  // Try to parse as JSON first (for label extraction results)
  try {
    const parsed = JSON.parse(content);
    if (parsed.source && parsed.source.url) {
      sources.push({
        url: parsed.source.url,
        title: parsed.source.title || 'Document',
        description: parsed.source.description || '',
      });
    }
    return sources;
  } catch {
    // Not JSON, try to extract from text format
  }

  // Extract from text format (Tavily results)
  const sourceRegex =
    /\[SOURCE_(\d+)\]\s*Title:\s*(.+?)\s*URL:\s*(.+?)\s*Content:\s*(.+?)\s*Fragment:\s*(.+?)(?=\n---|\n\[SOURCE_|$)/gs;
  let match;

  while ((match = sourceRegex.exec(content)) !== null) {
    const [, , title, url, , fragment] = match;
    if (title && url) {
      sources.push({
        url: url.trim(),
        title: title.trim(),
        description: fragment?.trim() || '',
      });
    }
  }

  return sources;
}
