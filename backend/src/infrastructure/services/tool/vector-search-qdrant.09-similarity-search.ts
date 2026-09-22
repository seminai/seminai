import { Document } from '@langchain/core/documents';
import { QdrantSearchFilter } from './vector-search-qdrant.support';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceSimilaritySearch(this: VectorSearchQdrantServiceContext, query: string, k: number = 5, filter?: QdrantSearchFilter): Promise<Document[]> {
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Executing similarity search for: "${query}"`);
    const results = await vectorStore.similaritySearch(query, k, filter);
    console.log(`[VectorSearchQdrant] Found ${results.length} results`);
    return results;
  }
