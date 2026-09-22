import { Document } from '@langchain/core/documents';
import axios from 'axios';
import { QdrantSearchFilter } from './vector-search-qdrant.support';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceSimilaritySearchWithScore(this: VectorSearchQdrantServiceContext, query: string, k: number = 5, filter?: QdrantSearchFilter): Promise<Array<[Document, number]>> {
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Executing similarity search with score for: "${query}"`);
    if (filter) {
      console.log(`[VectorSearchQdrant] Filter: ${JSON.stringify(filter)}`);
    }
    try {
      const results = await vectorStore.similaritySearchWithScore(query, k, filter);
      console.log(`[VectorSearchQdrant] Found ${results.length} results with scores`);
      return results;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VectorSearchQdrant] Search error: ${message}`);
      if (axios.isAxiosError(error) && error.response?.data) {
        console.error(`[VectorSearchQdrant] Error details: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
