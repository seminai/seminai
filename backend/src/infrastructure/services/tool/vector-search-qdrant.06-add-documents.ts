import { Document } from '@langchain/core/documents';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceAddDocuments(this: VectorSearchQdrantServiceContext, documents: Document[]): Promise<void> {
    const vectorStore = await this.getVectorStore();
    console.log(
      `[VectorSearchQdrant] Adding ${documents.length} documents to Qdrant in batches...`,
    );
    const batchSize = documents.length > 5000 ? 30 : 50;
    const maxRetries = 3;
    let addedCount = 0;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      let lastError: unknown;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await vectorStore.addDocuments(batch);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
            console.warn(
              `[VectorSearchQdrant] Batch ${Math.floor(i / batchSize) + 1} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      if (lastError) {
        console.error(
          `[VectorSearchQdrant] Batch failed after ${maxRetries} attempts at ${addedCount}/${documents.length} documents`,
        );
        throw lastError;
      }

      addedCount += batch.length;
      if ((i + batchSize) % 500 === 0 || i + batchSize >= documents.length) {
        console.log(
          `[VectorSearchQdrant] Progress: ${addedCount}/${documents.length} documents added`,
        );
      }
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < documents.length) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    console.log(`[VectorSearchQdrant] Successfully added ${addedCount} documents`);
  }
