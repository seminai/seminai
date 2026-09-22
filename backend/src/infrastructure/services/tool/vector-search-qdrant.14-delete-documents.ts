import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceDeleteDocuments(this: VectorSearchQdrantServiceContext, ids: string[]): Promise<void> {
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Deleting ${ids.length} documents...`);
    await vectorStore.delete({ ids });
    console.log(`[VectorSearchQdrant] Successfully deleted ${ids.length} documents`);
  }
