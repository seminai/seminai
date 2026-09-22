/**
 * In-memory vector store for BDF products.
 * Indexes BDF product search results and provides semantic search capabilities
 * for follow-up questions about authorized products.
 *
 * Follows the same pattern as JobOperationsVectorStore in chat_dosage_agent.
 */

import type { OpenAIEmbeddings } from '@langchain/openai';
import type { BdfProdotto } from '../../../integrations/bdf/types';
import { buildBdfProductDocument, SaMechanismMap } from './bdfProductTextBuilder';
import { createEmbeddings } from '../../../llm-embeddings-factory';
import {
  type BdfProductDocument,
  type BdfProductSearchResult,
  type BdfProductRAGConfig,
  type BdfProductIndexStats,
  DEFAULT_BDF_PRODUCT_RAG_CONFIG,
} from './types';

/**
 * Indexed document with its embedding vector.
 */
interface IndexedDocument {
  document: BdfProductDocument;
  embedding: number[];
}

const LOG_PREFIX = '[BdfProductVectorStore]';

/**
 * In-memory vector store for BDF products.
 * Provides semantic search over indexed products using OpenAI embeddings.
 */
export class BdfProductVectorStore {
  private readonly embeddings: OpenAIEmbeddings;
  private readonly config: Required<BdfProductRAGConfig>;
  private indexedDocuments: IndexedDocument[] = [];
  private stats: BdfProductIndexStats | null = null;

  constructor(config?: Partial<BdfProductRAGConfig>) {
    this.config = { ...DEFAULT_BDF_PRODUCT_RAG_CONFIG, ...config };

    this.embeddings = createEmbeddings({ modelName: this.config.embeddingModel }).embeddings;
  }

  /**
   * Indexes BDF products for semantic search.
   * Converts each product to a document and generates embeddings.
   */
  async indexProducts(
    products: BdfProdotto[],
    cropName: string,
    adversityName: string,
    saMechanismMap?: SaMechanismMap,
  ): Promise<void> {
    if (products.length === 0) {
      console.log(`${LOG_PREFIX} No products to index`);
      this.stats = {
        totalProducts: 0,
        indexedAt: new Date(),
        cropName,
        adversityName,
      };
      return;
    }

    console.log(`${LOG_PREFIX} Indexing ${products.length} products...`);

    // Convert products to documents (with mechanism of action if available)
    const documents = products.map((p) => buildBdfProductDocument(p, saMechanismMap));

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
          `${LOG_PREFIX} Embedded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`,
        );
      } catch (error) {
        console.error(`${LOG_PREFIX} Error embedding batch:`, error);
        throw error;
      }
    }

    // Store indexed documents
    this.indexedDocuments = documents.map((document, index) => ({
      document,
      embedding: allEmbeddings[index],
    }));

    this.stats = {
      totalProducts: products.length,
      indexedAt: new Date(),
      cropName,
      adversityName,
    };

    console.log(`${LOG_PREFIX} Successfully indexed ${this.indexedDocuments.length} products`);
  }

  /**
   * Performs semantic search over indexed products.
   */
  async search(query: string, topK?: number): Promise<BdfProductSearchResult[]> {
    const limit = topK ?? this.config.topK;

    if (this.indexedDocuments.length === 0) {
      console.log(`${LOG_PREFIX} No indexed documents to search`);
      return [];
    }

    try {
      const queryEmbedding = await this.embeddings.embedQuery(query);

      const scoredDocuments = this.indexedDocuments.map((indexed) => ({
        document: indexed.document,
        score: this.cosineSimilarity(queryEmbedding, indexed.embedding),
      }));

      const filteredResults = scoredDocuments
        .filter((result) => result.score >= this.config.similarityThreshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      console.log(
        `${LOG_PREFIX} Search found ${filteredResults.length} results above threshold ${this.config.similarityThreshold}`,
      );

      return filteredResults;
    } catch (error) {
      console.error(`${LOG_PREFIX} Search error:`, error);
      throw error;
    }
  }

  /**
   * Gets statistics about the indexed products.
   */
  getStats(): BdfProductIndexStats | null {
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
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      console.warn(`${LOG_PREFIX} Vector length mismatch`);
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
