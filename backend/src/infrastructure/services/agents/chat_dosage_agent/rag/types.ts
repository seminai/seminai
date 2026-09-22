/**
 * Type definitions for the RAG (Retrieval Augmented Generation) system
 * used to index and search job operations data.
 */

import { JobCategory } from '@prisma/client';

/**
 * Metadata associated with each indexed operation document.
 */
export interface JobOperationMetadata {
  readonly operationId: string;
  readonly jobId: string | null;
  readonly dateOfOperation: string;
  readonly category: JobCategory;
  readonly productNames: string[];
  readonly cropName: string;
  readonly cropType: string;
  readonly avversity: string | null;
  readonly companyName: string;
  readonly fieldNames: string[];
  readonly quantity: number;
  readonly unitOfMeasure: string;
}

/**
 * A document representing a job operation for vector indexing.
 */
export interface JobOperationDocument {
  readonly content: string;
  readonly metadata: JobOperationMetadata;
}

/**
 * Result of a semantic search over job operations.
 */
export interface JobOperationSearchResult {
  readonly document: JobOperationDocument;
  readonly score: number;
}

/**
 * Configuration for the RAG system.
 */
export interface RAGConfig {
  /** Minimum similarity score threshold (0-1). Default: 0.6 */
  readonly similarityThreshold?: number;
  /** Maximum number of results to return. Default: 5 */
  readonly topK?: number;
  /** Embedding model to use. Default: 'text-embedding-3-small' */
  readonly embeddingModel?: string;
}

/**
 * Default RAG configuration values.
 */
export const DEFAULT_RAG_CONFIG: Required<RAGConfig> = {
  similarityThreshold: 0.6,
  topK: 5,
  embeddingModel: 'text-embedding-3-small',
};

/**
 * Statistics about the indexed operations.
 */
export interface RAGIndexStats {
  readonly totalOperations: number;
  readonly indexedAt: Date;
  readonly jobId: string;
}
