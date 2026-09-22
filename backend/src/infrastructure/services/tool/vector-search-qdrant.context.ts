import { QdrantVectorStore } from '@langchain/qdrant';
import type { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { QdrantSearchFilter, SearchOptions } from './vector-search-qdrant.support';

export interface VectorSearchQdrantServiceContext {
  readonly url: string;
  readonly apiKey: string;
  readonly collectionName: string;
  readonly embeddings: OpenAIEmbeddings;
  readonly chunkSize: number;
  readonly chunkOverlap: number;
  vectorStore: QdrantVectorStore | null;
  ensurePayloadIndexes(): Promise<void>;
  getVectorStore(): Promise<QdrantVectorStore>;
  generateDocumentsFromPdfBuffer(pdfBuffer: Buffer, sourceName: string): Promise<Document[]>;
  generateDocumentsFromPdfUrl(pdfUrl: string): Promise<Document[]>;
  loadAndProcessPdf(pdfPath: string, sourceName: string, sourceType: 'buffer' | 'url'): Promise<Document[]>;
  addDocuments(documents: Document[]): Promise<void>;
  processPdfBufferAndSave(pdfBuffer: Buffer, sourceName: string): Promise<void>;
  processPdfUrlAndSave(pdfUrl: string): Promise<void>;
  similaritySearch(query: string, k?: number, filter?: QdrantSearchFilter): Promise<Document[]>;
  similaritySearchWithScore(query: string, k?: number, filter?: QdrantSearchFilter): Promise<Array<[Document, number]>>;
  asRetriever(options?: SearchOptions): Promise<VectorStoreRetriever<QdrantVectorStore>>;
  scrollByRuleId(workspaceId: string, ruleId: string, limit?: number): Promise<Array<{ pageContent: string; metadata: Record<string, unknown> }>>;
  deleteRulePdfVectors(workspaceId: string, ruleId: string): Promise<void>;
  deleteDocuments(ids: string[]): Promise<void>;
}
