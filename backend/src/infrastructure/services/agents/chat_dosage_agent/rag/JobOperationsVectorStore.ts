/**
 * In-memory vector store for job operations.
 * Indexes job operations and provides semantic search capabilities.
 *
 * This implementation follows the same pattern as InMemoryVectorSearchService
 * but is optimized for job operations with richer metadata support.
 */

import type { OpenAIEmbeddings } from '@langchain/openai';
import { JobWithAssignmentWithoutHistoryDTO } from '../../../../../domain/dtos/job-assignment.dto';
import { buildOperationDocument } from './operationTextBuilder';
import { createEmbeddings } from '../../../llm-embeddings-factory';
import {
  JobOperationDocument,
  JobOperationSearchResult,
  RAGConfig,
  RAGIndexStats,
  DEFAULT_RAG_CONFIG,
} from './types';

/**
 * Indexed document with its embedding vector.
 */
interface IndexedDocument {
  document: JobOperationDocument;
  embedding: number[];
}

/**
 * In-memory vector store for job operations.
 * Provides semantic search over indexed operations using OpenAI embeddings.
 */
export class JobOperationsVectorStore {
  private readonly embeddings: OpenAIEmbeddings;
  private readonly config: Required<RAGConfig>;
  private indexedDocuments: IndexedDocument[] = [];
  private stats: RAGIndexStats | null = null;

  constructor(config?: Partial<RAGConfig>) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };

    this.embeddings = createEmbeddings({ modelName: this.config.embeddingModel }).embeddings;
  }

  /**
   * Indexes job operations for semantic search.
   * Converts each operation to a document and generates embeddings.
   *
   * @param operations Array of job operations to index
   * @param jobId The job ID for tracking purposes
   */
  async indexOperations(
    operations: JobWithAssignmentWithoutHistoryDTO[],
    jobId: string,
  ): Promise<void> {
    if (operations.length === 0) {
      console.log('[JobOperationsVectorStore] No operations to index');
      this.stats = {
        totalOperations: 0,
        indexedAt: new Date(),
        jobId,
      };
      return;
    }

    console.log(`[JobOperationsVectorStore] Indexing ${operations.length} operations...`);

    // Convert operations to documents
    const documents = operations.map(buildOperationDocument);

    // Generate embeddings in batches to avoid rate limits
    const batchSize = 50;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const contents = batch.map((doc) => doc.content);

      try {
        const batchEmbeddings = await this.embeddings.embedDocuments(contents);
        allEmbeddings.push(...batchEmbeddings);

        console.log(
          `[JobOperationsVectorStore] Embedded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`,
        );
      } catch (error) {
        console.error(`[JobOperationsVectorStore] Error embedding batch:`, error);
        throw error;
      }
    }

    // Store indexed documents
    this.indexedDocuments = documents.map((document, index) => ({
      document,
      embedding: allEmbeddings[index],
    }));

    this.stats = {
      totalOperations: operations.length,
      indexedAt: new Date(),
      jobId,
    };

    console.log(
      `[JobOperationsVectorStore] Successfully indexed ${this.indexedDocuments.length} operations`,
    );
  }

  /**
   * Performs semantic search over indexed operations.
   *
   * @param query The search query in natural language
   * @param topK Maximum number of results to return (overrides config)
   * @returns Array of search results sorted by relevance
   */
  async search(query: string, topK?: number): Promise<JobOperationSearchResult[]> {
    const limit = topK ?? this.config.topK;

    if (this.indexedDocuments.length === 0) {
      console.log('[JobOperationsVectorStore] No indexed documents to search');
      return [];
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Calculate similarity scores
      const scoredDocuments = this.indexedDocuments.map((indexed) => ({
        document: indexed.document,
        score: this.cosineSimilarity(queryEmbedding, indexed.embedding),
      }));

      // Filter by threshold and sort by score
      const filteredResults = scoredDocuments
        .filter((result) => result.score >= this.config.similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      console.log(
        `[JobOperationsVectorStore] Search found ${filteredResults.length} results above threshold ${this.config.similarityThreshold}`,
      );

      return filteredResults;
    } catch (error) {
      console.error('[JobOperationsVectorStore] Search error:', error);
      throw error;
    }
  }

  /**
   * Gets all indexed documents (for debugging or display purposes).
   * Limited to avoid large payloads.
   *
   * @param limit Maximum documents to return
   * @returns Array of indexed documents
   */
  getDocuments(limit: number = 10): JobOperationDocument[] {
    return this.indexedDocuments.slice(0, limit).map((indexed) => indexed.document);
  }

  /**
   * Gets statistics about the indexed operations.
   */
  getStats(): RAGIndexStats | null {
    return this.stats;
  }

  /**
   * Checks if the store has indexed documents.
   */
  hasDocuments(): boolean {
    return this.indexedDocuments.length > 0;
  }

  /**
   * Clears all indexed documents.
   */
  clear(): void {
    this.indexedDocuments = [];
    this.stats = null;
  }

  /**
   * Calculates cosine similarity between two vectors.
   * Returns a value between 0 and 1 (higher is more similar).
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      console.warn('[JobOperationsVectorStore] Vector length mismatch');
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

/**
 * Creates and initializes a JobOperationsVectorStore with operations from a job.
 *
 * @param operations The job operations to index
 * @param jobId The job ID for tracking
 * @param config Optional RAG configuration
 * @returns Initialized vector store
 */
export async function createJobOperationsVectorStore(
  operations: JobWithAssignmentWithoutHistoryDTO[],
  jobId: string,
  config?: Partial<RAGConfig>,
): Promise<JobOperationsVectorStore> {
  const store = new JobOperationsVectorStore(config);
  await store.indexOperations(operations, jobId);
  return store;
}
