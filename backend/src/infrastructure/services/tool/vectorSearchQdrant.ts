import { QdrantVectorStore } from '@langchain/qdrant';
import type { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { createEmbeddings } from '../llm-embeddings-factory';
import { hasEmbeddingsApiKey } from '../llm-config';
import { resolveQdrantConnectionConfig } from '../qdrant-config';
import { VectorSearchQdrantConfig, QdrantSearchFilter, SearchOptions } from './vector-search-qdrant.support';
import type { VectorSearchQdrantServiceContext } from './vector-search-qdrant.context';
import { vectorSearchQdrantServiceEnsurePayloadIndexes } from './vector-search-qdrant.01-ensure-payload-indexes';
import { vectorSearchQdrantServiceGetVectorStore } from './vector-search-qdrant.02-get-vector-store';
import { vectorSearchQdrantServiceGenerateDocumentsFromPdfBuffer } from './vector-search-qdrant.03-generate-documents-from-pdf-buffer';
import { vectorSearchQdrantServiceGenerateDocumentsFromPdfUrl } from './vector-search-qdrant.04-generate-documents-from-pdf-url';
import { vectorSearchQdrantServiceLoadAndProcessPdf } from './vector-search-qdrant.05-load-and-process-pdf';
import { vectorSearchQdrantServiceAddDocuments } from './vector-search-qdrant.06-add-documents';
import { vectorSearchQdrantServiceProcessPdfBufferAndSave } from './vector-search-qdrant.07-process-pdf-buffer-and-save';
import { vectorSearchQdrantServiceProcessPdfUrlAndSave } from './vector-search-qdrant.08-process-pdf-url-and-save';
import { vectorSearchQdrantServiceSimilaritySearch } from './vector-search-qdrant.09-similarity-search';
import { vectorSearchQdrantServiceSimilaritySearchWithScore } from './vector-search-qdrant.10-similarity-search-with-score';
import { vectorSearchQdrantServiceAsRetriever } from './vector-search-qdrant.11-as-retriever';
import { vectorSearchQdrantServiceScrollByRuleId } from './vector-search-qdrant.12-scroll-by-rule-id';
import { vectorSearchQdrantServiceDeleteRulePdfVectors } from './vector-search-qdrant.13-delete-rule-pdf-vectors';
import { vectorSearchQdrantServiceDeleteDocuments } from './vector-search-qdrant.14-delete-documents';

export { type QdrantSearchFilter, type SearchOptions } from './vector-search-qdrant.support';

/**
 * Servizio per la gestione della ricerca vettoriale su Qdrant usando LangChain.
 * Implementa la creazione di embeddings da PDF (buffer e URL) e la ricerca semantica.
 */
export class VectorSearchQdrantService {

  readonly url: string;
  readonly apiKey: string;
  readonly collectionName: string;
  readonly embeddings: OpenAIEmbeddings;
  readonly chunkSize: number;
  readonly chunkOverlap: number;
  vectorStore: QdrantVectorStore | null = null;

  constructor(config: VectorSearchQdrantConfig) {
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.collectionName = config.collectionName;
    this.chunkSize = config.chunkSize ?? 1200;
    this.chunkOverlap = config.chunkOverlap ?? 250;
    this.embeddings = createEmbeddings({ modelName: config.embeddingModel }).embeddings;
  }

  /**
   * Creates payload indexes for filtering on metadata fields using REST API.
   * Required for efficient filtering on metadata.* fields in Qdrant.
   */
  public async ensurePayloadIndexes(): Promise<void> {
    return vectorSearchQdrantServiceEnsurePayloadIndexes.call(this as unknown as VectorSearchQdrantServiceContext);
  }

  /**
   * Connette o crea il vector store Qdrant
   */
  async getVectorStore(): Promise<QdrantVectorStore> {
    return vectorSearchQdrantServiceGetVectorStore.call(this as unknown as VectorSearchQdrantServiceContext);
  }

  /**
   * Genera documenti LangChain da un file PDF buffer
   * @param pdfBuffer Buffer del file PDF
   * @param sourceName Nome identificativo del documento sorgente
   * @returns Array di documenti LangChain
   */
  public async generateDocumentsFromPdfBuffer(
    pdfBuffer: Buffer,
    sourceName: string,
  ): Promise<Document[]> {
    return vectorSearchQdrantServiceGenerateDocumentsFromPdfBuffer.call(this as unknown as VectorSearchQdrantServiceContext, pdfBuffer, sourceName);
  }

  /**
   * Genera documenti LangChain da un PDF scaricato da URL
   * @param pdfUrl URL del file PDF
   * @returns Array di documenti LangChain
   */
  public async generateDocumentsFromPdfUrl(pdfUrl: string): Promise<Document[]> {
    return vectorSearchQdrantServiceGenerateDocumentsFromPdfUrl.call(this as unknown as VectorSearchQdrantServiceContext, pdfUrl);
  }

  /**
   * Carica e processa un file PDF per generare documenti LangChain
   */
  async loadAndProcessPdf(
    pdfPath: string,
    sourceName: string,
    sourceType: 'buffer' | 'url',
  ): Promise<Document[]> {
    return vectorSearchQdrantServiceLoadAndProcessPdf.call(this as unknown as VectorSearchQdrantServiceContext, pdfPath, sourceName, sourceType);
  }

  /**
   * Aggiunge documenti al vector store Qdrant in batch per evitare limiti di payload.
   * Include retry con exponential backoff per gestire errori transitori di rete.
   * @param documents Array di documenti LangChain da aggiungere
   */
  public async addDocuments(documents: Document[]): Promise<void> {
    return vectorSearchQdrantServiceAddDocuments.call(this as unknown as VectorSearchQdrantServiceContext, documents);
  }

  /**
   * Processa e salva documenti da un PDF buffer
   * @param pdfBuffer Buffer del file PDF
   * @param sourceName Nome identificativo del documento
   */
  public async processPdfBufferAndSave(pdfBuffer: Buffer, sourceName: string): Promise<void> {
    return vectorSearchQdrantServiceProcessPdfBufferAndSave.call(this as unknown as VectorSearchQdrantServiceContext, pdfBuffer, sourceName);
  }

  /**
   * Processa e salva documenti da un PDF URL
   * @param pdfUrl URL del file PDF
   */
  public async processPdfUrlAndSave(pdfUrl: string): Promise<void> {
    return vectorSearchQdrantServiceProcessPdfUrlAndSave.call(this as unknown as VectorSearchQdrantServiceContext, pdfUrl);
  }

  /**
   * Esegue una ricerca di similarità
   * @param query Testo della query di ricerca
   * @param k Numero di risultati da restituire (default: 5)
   * @param filter Filtro opzionale per la ricerca
   * @returns Array di documenti ordinati per similarità
   */
  public async similaritySearch(
    query: string,
    k: number = 5,
    filter?: QdrantSearchFilter,
  ): Promise<Document[]> {
    return vectorSearchQdrantServiceSimilaritySearch.call(this as unknown as VectorSearchQdrantServiceContext, query, k, filter);
  }

  /**
   * Esegue una ricerca di similarità con score
   * @param query Testo della query di ricerca
   * @param k Numero di risultati da restituire (default: 5)
   * @param filter Filtro opzionale per la ricerca
   * @returns Array di tuple [documento, score] ordinati per similarità
   */
  public async similaritySearchWithScore(
    query: string,
    k: number = 5,
    filter?: QdrantSearchFilter,
  ): Promise<Array<[Document, number]>> {
    return vectorSearchQdrantServiceSimilaritySearchWithScore.call(this as unknown as VectorSearchQdrantServiceContext, query, k, filter);
  }

  /**
   * Crea un retriever per l'uso in chains
   * @param options Opzioni per il retriever (k e filter)
   * @returns VectorStoreRetriever configurato
   */
  public async asRetriever(
    options?: SearchOptions,
  ): Promise<VectorStoreRetriever<QdrantVectorStore>> {
    return vectorSearchQdrantServiceAsRetriever.call(this as unknown as VectorSearchQdrantServiceContext, options);
  }

  /**
   * Scrolls points belonging to a specific ruleId, returning a sample of chunks.
   * Uses the Qdrant scroll REST API to read by metadata filter (no embedding query).
   */
  public async scrollByRuleId(
    workspaceId: string,
    ruleId: string,
    limit: number = 20,
  ): Promise<Array<{ pageContent: string; metadata: Record<string, unknown> }>> {
    return vectorSearchQdrantServiceScrollByRuleId.call(this as unknown as VectorSearchQdrantServiceContext, workspaceId, ruleId, limit);
  }

  /**
   * Deletes all vectorized PDF chunks for a specific rule.
   * Uses a metadata filter so retries/re-vectorization do not leave stale chunks behind.
   */
  public async deleteRulePdfVectors(workspaceId: string, ruleId: string): Promise<void> {
    return vectorSearchQdrantServiceDeleteRulePdfVectors.call(this as unknown as VectorSearchQdrantServiceContext, workspaceId, ruleId);
  }

  /**
   * Elimina documenti dal vector store
   * @param ids Array di IDs dei documenti da eliminare
   */
  public async deleteDocuments(ids: string[]): Promise<void> {
    return vectorSearchQdrantServiceDeleteDocuments.call(this as unknown as VectorSearchQdrantServiceContext, ids);
  }
}

export function createVectorSearchQdrantService(
  collectionName = 'vector_embeddings',
): VectorSearchQdrantService {
  const { url, apiKey } = resolveQdrantConnectionConfig();
  if (!hasEmbeddingsApiKey()) {
    throw new Error('Embeddings are not configured for the active LLM provider');
  }
  return new VectorSearchQdrantService({ url, apiKey, collectionName });
}
