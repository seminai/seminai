import { QdrantVectorStore } from '@langchain/qdrant';
import type { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { convertPdfToTextWithPositionalAnaylsis } from '../ocr/pdfToText';
import { createEmbeddings } from '../llm-embeddings-factory';
import { hasEmbeddingsApiKey } from '../llm-config';
import { resolveQdrantConnectionConfig } from '../qdrant-config';

/**
 * Configurazione per il servizio Qdrant
 */
interface VectorSearchQdrantConfig {
  url: string;
  apiKey: string;
  collectionName: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Filtro per la ricerca Qdrant
 */
export interface QdrantSearchFilter {
  must?: Array<{
    key: string;
    match: { value: string | number | boolean };
  }>;
  should?: Array<{
    key: string;
    match: { value: string | number | boolean };
  }>;
  must_not?: Array<{
    key: string;
    match: { value: string | number | boolean };
  }>;
}

/**
 * Opzioni per la ricerca
 */
export interface SearchOptions {
  k?: number;
  filter?: QdrantSearchFilter;
}

/**
 * Servizio per la gestione della ricerca vettoriale su Qdrant usando LangChain.
 * Implementa la creazione di embeddings da PDF (buffer e URL) e la ricerca semantica.
 */
export class VectorSearchQdrantService {
  private readonly url: string;
  private readonly apiKey: string;
  private readonly collectionName: string;
  private readonly embeddings: OpenAIEmbeddings;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private vectorStore: QdrantVectorStore | null = null;

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
    const fieldNames = [
      'metadata.ruleId',
      'metadata.workspaceId',
      'metadata.sourceType',
      'metadata.category',
      'metadata.region',
    ];

    console.log(`[VectorSearchQdrant] Ensuring payload indexes for ${this.collectionName}...`);

    for (const fieldName of fieldNames) {
      try {
        await axios.put(
          `${this.url}/collections/${this.collectionName}/index`,
          {
            field_name: fieldName,
            field_schema: 'keyword',
          },
          {
            headers: {
              'api-key': this.apiKey,
              'Content-Type': 'application/json',
            },
            params: { wait: true },
          },
        );
        console.log(`[VectorSearchQdrant] Created index for ${fieldName}`);
      } catch (error: any) {
        // Ignore 409 conflict (index already exists)
        if (error.response?.status !== 409) {
          console.warn(
            `[VectorSearchQdrant] Failed to create index for ${fieldName}: ${error.response?.data?.status?.error || error.message}`,
          );
        }
      }
    }
  }

  /**
   * Connette o crea il vector store Qdrant
   */
  private async getVectorStore(): Promise<QdrantVectorStore> {
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
    const tempFilePath = path.join(os.tmpdir(), `temp-pdf-${Date.now()}.pdf`);
    try {
      const view = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
      fs.writeFileSync(tempFilePath, view);
      const documents = await this.loadAndProcessPdf(tempFilePath, sourceName, 'buffer');
      return documents;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Genera documenti LangChain da un PDF scaricato da URL
   * @param pdfUrl URL del file PDF
   * @returns Array di documenti LangChain
   */
  public async generateDocumentsFromPdfUrl(pdfUrl: string): Promise<Document[]> {
    const tempFilePath = path.join(os.tmpdir(), `temp-pdf-url-${Date.now()}.pdf`);
    try {
      console.log(`[VectorSearchQdrant] Downloading PDF from ${pdfUrl}`);
      const response = await axios.get<ArrayBuffer>(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
        },
      });
      if (response.status < 200 || response.status >= 300 || !response.data) {
        throw new Error(`Failed to download PDF: HTTP ${response.status}`);
      }
      const buffer = Buffer.from(response.data);
      const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      fs.writeFileSync(tempFilePath, view);
      const documents = await this.loadAndProcessPdf(tempFilePath, pdfUrl, 'url');
      return documents;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Carica e processa un file PDF per generare documenti LangChain
   */
  private async loadAndProcessPdf(
    pdfPath: string,
    sourceName: string,
    sourceType: 'buffer' | 'url',
  ): Promise<Document[]> {
    console.log(`[VectorSearchQdrant] Loading PDF: ${sourceName}`);
    const { text } = await convertPdfToTextWithPositionalAnaylsis(pdfPath);
    if (!text || text.trim().length === 0) {
      console.warn(`[VectorSearchQdrant] No text extracted from ${sourceName}`);
      return [];
    }
    console.log(`[VectorSearchQdrant] Extracted ${text.length} characters from ${sourceName}`);
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' ', ''],
      keepSeparator: true,
    });
    const chunks = await textSplitter.splitText(text);
    console.log(`[VectorSearchQdrant] Created ${chunks.length} chunks`);
    const documents: Document[] = chunks.map((chunk, index) => ({
      pageContent: chunk,
      metadata: {
        source: sourceName,
        chunkIndex: index,
        sourceType,
        createdAt: new Date().toISOString(),
      },
    }));
    return documents;
  }

  /**
   * Aggiunge documenti al vector store Qdrant in batch per evitare limiti di payload.
   * Include retry con exponential backoff per gestire errori transitori di rete.
   * @param documents Array di documenti LangChain da aggiungere
   */
  public async addDocuments(documents: Document[]): Promise<void> {
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

  /**
   * Processa e salva documenti da un PDF buffer
   * @param pdfBuffer Buffer del file PDF
   * @param sourceName Nome identificativo del documento
   */
  public async processPdfBufferAndSave(pdfBuffer: Buffer, sourceName: string): Promise<void> {
    const documents = await this.generateDocumentsFromPdfBuffer(pdfBuffer, sourceName);
    if (documents.length === 0) {
      console.warn(`[VectorSearchQdrant] No documents to save for ${sourceName}`);
      return;
    }
    await this.addDocuments(documents);
  }

  /**
   * Processa e salva documenti da un PDF URL
   * @param pdfUrl URL del file PDF
   */
  public async processPdfUrlAndSave(pdfUrl: string): Promise<void> {
    const documents = await this.generateDocumentsFromPdfUrl(pdfUrl);
    if (documents.length === 0) {
      console.warn(`[VectorSearchQdrant] No documents to save for ${pdfUrl}`);
      return;
    }
    await this.addDocuments(documents);
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
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Executing similarity search for: "${query}"`);
    const results = await vectorStore.similaritySearch(query, k, filter);
    console.log(`[VectorSearchQdrant] Found ${results.length} results`);
    return results;
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
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Executing similarity search with score for: "${query}"`);
    if (filter) {
      console.log(`[VectorSearchQdrant] Filter: ${JSON.stringify(filter)}`);
    }
    try {
      const results = await vectorStore.similaritySearchWithScore(query, k, filter);
      console.log(`[VectorSearchQdrant] Found ${results.length} results with scores`);
      return results;
    } catch (error: any) {
      console.error(`[VectorSearchQdrant] Search error: ${error.message}`);
      if (error.response?.data) {
        console.error(`[VectorSearchQdrant] Error details: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Crea un retriever per l'uso in chains
   * @param options Opzioni per il retriever (k e filter)
   * @returns VectorStoreRetriever configurato
   */
  public async asRetriever(
    options?: SearchOptions,
  ): Promise<VectorStoreRetriever<QdrantVectorStore>> {
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Creating retriever with options:`, options);
    return vectorStore.asRetriever({
      k: options?.k ?? 5,
      filter: options?.filter,
    });
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
    const url = `${this.url.replace(/\/+$/, '')}/collections/${this.collectionName}/points/scroll`;
    const body = {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.ruleId', match: { value: ruleId } },
          { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
        ],
      },
      limit,
      with_payload: true,
      with_vector: false,
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['api-key'] = this.apiKey;
    const response = await axios.post(url, body, { headers, timeout: 15_000 });
    const points: Array<{ payload?: Record<string, unknown> }> =
      response.data?.result?.points ?? [];
    return points.map((p) => {
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      const pageContent = typeof payload.pageContent === 'string' ? payload.pageContent : '';
      const metadata = (payload.metadata as Record<string, unknown>) ?? {};
      return { pageContent, metadata };
    });
  }

  /**
   * Deletes all vectorized PDF chunks for a specific rule.
   * Uses a metadata filter so retries/re-vectorization do not leave stale chunks behind.
   */
  public async deleteRulePdfVectors(workspaceId: string, ruleId: string): Promise<void> {
    const url = `${this.url.replace(/\/+$/, '')}/collections/${this.collectionName}/points/delete`;
    const body = {
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.ruleId', match: { value: ruleId } },
          { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
        ],
      },
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['api-key'] = this.apiKey;
    try {
      await axios.post(url, body, { headers, params: { wait: true }, timeout: 30_000 });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return;
      }
      throw err;
    }
  }

  /**
   * Elimina documenti dal vector store
   * @param ids Array di IDs dei documenti da eliminare
   */
  public async deleteDocuments(ids: string[]): Promise<void> {
    const vectorStore = await this.getVectorStore();
    console.log(`[VectorSearchQdrant] Deleting ${ids.length} documents...`);
    await vectorStore.delete({ ids });
    console.log(`[VectorSearchQdrant] Successfully deleted ${ids.length} documents`);
  }
}

/**
 * Factory function per creare un'istanza del servizio con variabili d'ambiente
 */
export function createVectorSearchQdrantService(
  collectionName: string = 'vector_embeddings',
): VectorSearchQdrantService {
  const { url, apiKey } = resolveQdrantConnectionConfig();
  if (!hasEmbeddingsApiKey()) {
    throw new Error('OPENAI_API_KEY is required for embeddings');
  }
  return new VectorSearchQdrantService({
    url,
    apiKey,
    collectionName,
  });
}
