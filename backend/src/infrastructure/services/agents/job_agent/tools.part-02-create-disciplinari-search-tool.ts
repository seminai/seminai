import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDisciplinariFromBDF } from '../../tool/getDisciplinariFromBDF';
import { createVectorSearchQdrantService, VectorSearchQdrantService } from '../../tool/vectorSearchQdrant';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { prisma } from '../../../repositories/Prisma';

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
export function truncateValue(value: unknown, maxLength: number = 200): unknown {
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

export function getObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readPath(root: unknown, parts: readonly string[]): { value: unknown; failedAt?: string } {
  let current = root;
  for (const part of parts) {
    if (current === undefined || current === null) return { value: undefined, failedAt: part };
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    const record = getObject(current);
    if (!record) return { value: undefined, failedAt: part };
    if (!arrayMatch) {
      current = record[part];
      continue;
    }
    const [, arrayName, indexText] = arrayMatch;
    const array = record[arrayName];
    if (!Array.isArray(array)) return { value: undefined, failedAt: part };
    current = array[Number.parseInt(indexText, 10)];
  }
  return { value: current };
}
