import { QdrantVectorStore } from '@langchain/qdrant';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { SearchOptions } from './vector-search-qdrant.support';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceAsRetriever(this: VectorSearchQdrantServiceContext, options?: SearchOptions): Promise<VectorStoreRetriever<QdrantVectorStore>> {
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Creating retriever with options:`, options);
    return vectorStore.asRetriever({
      k: options?.k ?? 5,
      filter: options?.filter,
    });
  }
