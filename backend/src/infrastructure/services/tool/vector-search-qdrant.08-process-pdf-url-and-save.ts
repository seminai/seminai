import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';

export async function vectorSearchQdrantServiceProcessPdfUrlAndSave(this: VectorSearchQdrantServiceContext, pdfUrl: string): Promise<void> {
    const documents = await this.generateDocumentsFromPdfUrl(pdfUrl);
    if (documents.length === 0) {
      console.warn(`[VectorSearchQdrant] No documents to save for ${pdfUrl}`);
      return;
    }
    await this.addDocuments(documents);
  }
