import { MongoClient, Collection, Db } from 'mongodb';
import type { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { convertPdfToTextWithPositionalAnaylsis } from '../ocr/pdfToText';
import { createEmbeddings } from '../llm-embeddings-factory';
import { hasEmbeddingsApiKey } from '../llm-config';

/**
 * Interface per i risultati degli embeddings
 */
interface EmbeddingResult {
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    chunkIndex: number;
    sourceType: 'buffer' | 'url';
  };
}

/**
 * Interface per i documenti MongoDB con embeddings
 */
interface VectorDocument {
  text: string;
  embedding: number[];
  metadata: {
    source: string;
    chunkIndex: number;
    sourceType: 'buffer' | 'url';
    createdAt: Date;
  };
}

/**
 * Interface per i risultati della ricerca vettoriale
 */
interface VectorSearchResult {
  text: string;
  score: number;
  metadata: {
    source: string;
    chunkIndex: number;
    sourceType: 'buffer' | 'url';
  };
}

/**
 * Parametri per la configurazione del servizio
 */
interface VectorSearchMongoDBConfig {
  mongoUri: string;
  databaseName: string;
  collectionName: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Servizio per la gestione della ricerca vettoriale su MongoDB.
 * Implementa la creazione di embeddings da PDF (buffer e URL) e la ricerca semantica.
 */
export class VectorSearchMongoDBService {
  private readonly mongoUri: string;
  private readonly databaseName: string;
  private readonly collectionName: string;
  private readonly embeddings: OpenAIEmbeddings;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private client: MongoClient | null = null;
  private database: Db | null = null;
  private collection: Collection<VectorDocument> | null = null;
  private readonly isTestEnvironment: boolean;

  constructor(config: VectorSearchMongoDBConfig) {
    this.mongoUri = config.mongoUri;
    this.databaseName = config.databaseName;
    this.collectionName = config.collectionName;
    this.chunkSize = config.chunkSize ?? 1200;
    this.chunkOverlap = config.chunkOverlap ?? 250;
    this.isTestEnvironment = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
    this.embeddings = createEmbeddings({ modelName: config.embeddingModel }).embeddings;
  }

  /**
   * Metodo helper per il logging che rispetta l'ambiente Jest
   */
  private log(message: string): void {
    if (!this.isTestEnvironment) {
      console.log(message);
    }
  }

  /**
   * Connette al database MongoDB
   */
  private async connect(): Promise<void> {
    if (this.client && this.database && this.collection) {
      return;
    }
    this.client = new MongoClient(this.mongoUri);
    await this.client.connect();
    this.database = this.client.db(this.databaseName);
    this.collection = this.database.collection<VectorDocument>(this.collectionName);
    this.log(`[VectorSearchMongoDB] Connected to ${this.databaseName}.${this.collectionName}`);
  }

  /**
   * Chiude la connessione MongoDB
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.database = null;
      this.collection = null;
      this.log('[VectorSearchMongoDB] Disconnected');
    }
  }

  /**
   * Crea un indice di ricerca vettoriale su MongoDB Atlas
   * @param numDimensions Numero di dimensioni del vettore (1536 per text-embedding-3-small)
   */
  public async createVectorSearchIndex(numDimensions: number = 1536): Promise<string> {
    await this.connect();
    if (!this.collection) {
      throw new Error('[VectorSearchMongoDB] Collection not initialized');
    }
    const indexDefinition = {
      name: 'vector_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            similarity: 'dotProduct',
            numDimensions,
          },
        ],
      },
    };
    try {
      const result = await this.collection.createSearchIndex(indexDefinition);
      this.log(`[VectorSearchMongoDB] Vector index created: ${result}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`[VectorSearchMongoDB] Failed to create vector index: ${errorMessage}`);
    }
  }

  /**
   * Genera embeddings da un file PDF buffer
   * @param pdfBuffer Buffer del file PDF
   * @param sourceName Nome identificativo del documento sorgente
   * @returns Array di risultati con embeddings
   */
  public async generateEmbeddingsFromPdfBuffer(
    pdfBuffer: Buffer,
    sourceName: string,
  ): Promise<EmbeddingResult[]> {
    const tempFilePath = path.join(os.tmpdir(), `temp-pdf-${Date.now()}.pdf`);
    try {
      const view = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
      fs.writeFileSync(tempFilePath, view);
      const results = await this.loadAndProcessPdf(tempFilePath, sourceName, 'buffer');
      return results;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Genera embeddings da un PDF scaricato da URL
   * @param pdfUrl URL del file PDF
   * @returns Array di risultati con embeddings
   */
  public async generateEmbeddingsFromPdfUrl(pdfUrl: string): Promise<EmbeddingResult[]> {
    const tempFilePath = path.join(os.tmpdir(), `temp-pdf-url-${Date.now()}.pdf`);
    try {
      this.log(`[VectorSearchMongoDB] Downloading PDF from ${pdfUrl}`);
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
      const results = await this.loadAndProcessPdf(tempFilePath, pdfUrl, 'url');
      return results;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Carica e processa un file PDF per generare embeddings
   */
  private async loadAndProcessPdf(
    pdfPath: string,
    sourceName: string,
    sourceType: 'buffer' | 'url',
  ): Promise<EmbeddingResult[]> {
    this.log(`[VectorSearchMongoDB] Loading PDF: ${sourceName}`);
    const { text } = await convertPdfToTextWithPositionalAnaylsis(pdfPath);
    if (!text || text.trim().length === 0) {
      console.warn(`[VectorSearchMongoDB] No text extracted from ${sourceName}`);
      return [];
    }
    this.log(`[VectorSearchMongoDB] Extracted ${text.length} characters from ${sourceName}`);
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
      separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' ', ''],
      keepSeparator: true,
    });
    const chunks = await textSplitter.splitText(text);
    this.log(`[VectorSearchMongoDB] Created ${chunks.length} chunks`);
    this.log('[VectorSearchMongoDB] Generating embeddings...');
    const results: EmbeddingResult[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await this.embeddings.embedQuery(chunk);
      results.push({
        content: chunk,
        embedding,
        metadata: {
          source: sourceName,
          chunkIndex: i,
          sourceType,
        },
      });
      if ((i + 1) % 10 === 0) {
        this.log(`[VectorSearchMongoDB] Processed ${i + 1}/${chunks.length} chunks`);
      }
    }
    this.log(`[VectorSearchMongoDB] Generated ${results.length} embeddings`);
    return results;
  }

  /**
   * Salva gli embeddings in MongoDB
   * @param embeddings Array di embeddings da salvare
   */
  public async saveEmbeddings(embeddings: EmbeddingResult[]): Promise<void> {
    await this.connect();
    if (!this.collection) {
      throw new Error('[VectorSearchMongoDB] Collection not initialized');
    }
    this.log(`[VectorSearchMongoDB] Preparing ${embeddings.length} documents for insertion...`);
    const documents: VectorDocument[] = embeddings.map((emb) => ({
      text: emb.content,
      embedding: emb.embedding,
      metadata: {
        ...emb.metadata,
        createdAt: new Date(),
      },
    }));
    const batchSize = 100;
    let insertedCount = 0;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const existingDocs = await this.collection.countDocuments({
        'metadata.source': batch[0].metadata.source,
        'metadata.chunkIndex': { $in: batch.map((doc) => doc.metadata.chunkIndex) },
      });
      if (existingDocs === 0) {
        const result = await this.collection.insertMany(batch, { ordered: false });
        insertedCount += result.insertedCount;
        this.log(
          `[VectorSearchMongoDB] Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)} (${result.insertedCount} documents)`,
        );
      } else {
        this.log(
          `[VectorSearchMongoDB] Skipped batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)} (already exists)`,
        );
      }
    }
    this.log(
      `[VectorSearchMongoDB] Successfully saved ${insertedCount} embeddings to collection ${this.collectionName}`,
    );
  }

  /**
   * Esegue una ricerca vettoriale semantica
   * @param queryText Testo della query di ricerca
   * @param limit Numero massimo di risultati da restituire (default: 5)
   * @param exact Se true, usa ricerca esatta (più lenta ma più accurata)
   * @returns Array di risultati ordinati per rilevanza
   */
  public async vectorSearch(
    queryText: string,
    limit: number = 5,
    exact: boolean = true,
  ): Promise<VectorSearchResult[]> {
    await this.connect();
    if (!this.collection) {
      throw new Error('[VectorSearchMongoDB] Collection not initialized');
    }
    this.log(`[VectorSearchMongoDB] Generating query embedding for: "${queryText}"`);
    const queryEmbedding = await this.embeddings.embedQuery(queryText);
    this.log('[VectorSearchMongoDB] Executing vector search...');
    const pipeline = [
      {
        $vectorSearch: {
          index: 'vector_index',
          queryVector: queryEmbedding,
          path: 'embedding',
          exact,
          limit,
        },
      },
      {
        $project: {
          _id: 0,
          text: 1,
          score: { $meta: 'vectorSearchScore' },
          metadata: {
            source: '$metadata.source',
            chunkIndex: '$metadata.chunkIndex',
            sourceType: '$metadata.sourceType',
          },
        },
      },
    ];
    const results = await this.collection.aggregate(pipeline).toArray();
    this.log(`[VectorSearchMongoDB] Found ${results.length} results`);
    return results as VectorSearchResult[];
  }

  /**
   * Processa e salva embeddings da un PDF buffer
   * @param pdfBuffer Buffer del file PDF
   * @param sourceName Nome identificativo del documento
   */
  public async processPdfBufferAndSave(pdfBuffer: Buffer, sourceName: string): Promise<void> {
    const embeddings = await this.generateEmbeddingsFromPdfBuffer(pdfBuffer, sourceName);
    await this.saveEmbeddings(embeddings);
  }

  /**
   * Processa e salva embeddings da un PDF URL
   * @param pdfUrl URL del file PDF
   */
  public async processPdfUrlAndSave(pdfUrl: string): Promise<void> {
    const embeddings = await this.generateEmbeddingsFromPdfUrl(pdfUrl);
    await this.saveEmbeddings(embeddings);
  }
}

/**
 * Factory function per creare un'istanza del servizio con variabili d'ambiente
 */
export function createVectorSearchMongoDBService(
  collectionName: string = 'vector_embeddings',
): VectorSearchMongoDBService {
  const mongoUri = process.env.MONGODB_VECTOR_URI;
  const databaseName = process.env.MONGODB_VECTOR_DB;
  if (!mongoUri) {
    throw new Error('MONGODB_VECTOR_URI environment variable is required');
  }
  if (!databaseName) {
    throw new Error('MONGODB_VECTOR_DB environment variable is required');
  }
  if (!hasEmbeddingsApiKey()) {
    throw new Error('OPENAI_API_KEY is required for embeddings');
  }
  return new VectorSearchMongoDBService({
    mongoUri,
    databaseName,
    collectionName,
  });
}
