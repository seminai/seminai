import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceProcessPdfBufferAndSave(this: VectorSearchQdrantServiceContext, pdfBuffer: Buffer, sourceName: string): Promise<void> {
    const documents = await this.generateDocumentsFromPdfBuffer(pdfBuffer, sourceName);
    if (documents.length === 0) {
      console.warn(`[VectorSearchQdrant] No documents to save for ${sourceName}`);
      return;
    }
    await this.addDocuments(documents);
  }
