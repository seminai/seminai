import { QdrantVectorStore } from '@langchain/qdrant';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceGetVectorStore(this: VectorSearchQdrantServiceContext): Promise<QdrantVectorStore> {
    if (this.vectorStore) {
      return this.vectorStore;
    }
    console.log(`[VectorSearchQdrant] Connecting to Qdrant collection: ${this.collectionName}`);
    try {
      this.vectorStore = await QdrantVectorStore.fromExistingCollection(this.embeddings, {
        url: this.url,
        apiKey: this.apiKey,
        collectionName: this.collectionName,
      });
      console.log(`[VectorSearchQdrant] Connected to existing collection: ${this.collectionName}`);
    } catch (error) {
      console.log(
        `[VectorSearchQdrant] Collection does not exist, will be created on first insert`,
      );
      this.vectorStore = new QdrantVectorStore(this.embeddings, {
        url: this.url,
        apiKey: this.apiKey,
        collectionName: this.collectionName,
      });
    }
    return this.vectorStore;
  }
