/**
 * Type definitions for the BDF product in-memory vector store.
 */

/**
 * Metadata associated with each indexed BDF product document.
 */
export interface BdfProductMetadata {
  readonly codice: string;
  readonly nome: string;
  readonly bio: boolean;
  readonly inVendita: boolean;
  readonly sostanzeAttive: string[];
  readonly meccanismoAzione?: string[];
  readonly revocato: boolean;
  readonly scorte: boolean | null;
  readonly numRegistrazione: string;
}

/**
 * A document representing a BDF product for vector indexing.
 */
export interface BdfProductDocument {
  readonly content: string;
  readonly metadata: BdfProductMetadata;
}

/**
 * Result of a semantic search over BDF products.
 */
export interface BdfProductSearchResult {
  readonly document: BdfProductDocument;
  readonly score: number;
}

/**
 * Statistics about the indexed BDF products.
 */
export interface BdfProductIndexStats {
  readonly totalProducts: number;
  readonly indexedAt: Date;
  readonly cropName: string;
  readonly adversityName: string;
}

/**
 * Configuration for the BDF product RAG system.
 */
export interface BdfProductRAGConfig {
  readonly similarityThreshold?: number;
  readonly topK?: number;
  readonly embeddingModel?: string;
}

export const DEFAULT_BDF_PRODUCT_RAG_CONFIG: Required<BdfProductRAGConfig> = {
  similarityThreshold: 0.5,
  topK: 10,
  embeddingModel: 'text-embedding-3-small',
};
