import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import {
  VectorSearchMongoDBService,
  createVectorSearchMongoDBService,
} from '../../services/tool/vectorSearchMongoDB';
import {
  VectorSearchQdrantService,
  createVectorSearchQdrantService,
} from '../../services/tool/vectorSearchQdrant';

/**
 * Interface per i record del CSV disciplinari
 */
interface DisciplinareRecord {
  title: string;
  anno: string;
  url: string;
}

/**
 * Interface per il risultato del processing di un disciplinare
 */
interface ProcessingResult {
  title: string;
  url: string;
  success: boolean;
  error?: string;
}

/**
 * Interface per il response dell'upsert
 */
interface UpsertResponse {
  success: boolean;
  message: string;
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  results: ProcessingResult[];
}

/**
 * Interface per la richiesta di ricerca
 */
interface SearchRequest {
  query: string;
  limit?: number;
}

/**
 * Interface per il risultato della ricerca MongoDB
 */
interface MongoSearchResult {
  text: string;
  score: number;
  metadata: {
    source: string;
    chunkIndex: number;
    sourceType: string;
  };
}

/**
 * Interface per il response della ricerca
 */
interface SearchResponse {
  success: boolean;
  query: string;
  limit: number;
  resultsCount: number;
  results: Array<{
    content: string;
    score?: number;
    source: string;
    chunkIndex: number;
    sourceType: string;
  }>;
}

/**
 * Controller per la gestione degli upsert dei disciplinari nei vector stores
 */
export class VectorSearchController {
  private readonly csvPath: string;
  private readonly batchSize: number = 3;

  constructor() {
    this.csvPath = path.join(process.cwd(), 'dataset', 'disciplinari', 'bdf.csv');
  }

  /**
   * Legge e parsifica il CSV dei disciplinari
   */
  private readDisciplinariCsv(): DisciplinareRecord[] {
    if (!fs.existsSync(this.csvPath)) {
      throw new Error(`CSV file not found: ${this.csvPath}`);
    }
    const fileContent = fs.readFileSync(this.csvPath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as DisciplinareRecord[];
    return records;
  }

  /**
   * Processa un singolo disciplinare con retry logic
   */
  private async processSingleDisciplinare(
    service: VectorSearchMongoDBService | VectorSearchQdrantService,
    record: DisciplinareRecord,
    maxRetries: number = 2,
  ): Promise<ProcessingResult> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `[VectorSearchController] Processing: ${record.title} (attempt ${attempt + 1}/${maxRetries + 1})`,
        );
        await service.processPdfUrlAndSave(record.url);
        return {
          title: record.title,
          url: record.url,
          success: true,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[VectorSearchController] Error processing ${record.title} (attempt ${attempt + 1}): ${lastError.message}`,
        );
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`[VectorSearchController] Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }
    return {
      title: record.title,
      url: record.url,
      success: false,
      error: lastError?.message ?? 'Unknown error',
    };
  }

  /**
   * Processa un batch di disciplinari
   */
  private async processBatch(
    service: VectorSearchMongoDBService | VectorSearchQdrantService,
    batch: DisciplinareRecord[],
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    for (const record of batch) {
      const result = await this.processSingleDisciplinare(service, record);
      results.push(result);
    }
    return results;
  }

  /**
   * Endpoint per l'upsert dei disciplinari su MongoDB
   * POST /vector-search/upsert-disciplinari-mongo
   */
  public async upsertDisciplinariMongo(_req: Request, res: Response): Promise<Response> {
    let service: VectorSearchMongoDBService | null = null;
    try {
      console.log('[VectorSearchController] Starting MongoDB upsert process...');
      const records = this.readDisciplinariCsv();
      console.log(`[VectorSearchController] Found ${records.length} disciplinari to process`);
      service = createVectorSearchMongoDBService('disciplinari_bdf');
      const allResults: ProcessingResult[] = [];
      for (let i = 0; i < records.length; i += this.batchSize) {
        const batch = records.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(records.length / this.batchSize);
        console.log(
          `[VectorSearchController] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`,
        );
        const batchResults = await this.processBatch(service, batch);
        allResults.push(...batchResults);
        console.log(`[VectorSearchController] Batch ${batchNumber}/${totalBatches} completed`);
      }
      const successCount = allResults.filter((r) => r.success).length;
      const errorCount = allResults.filter((r) => !r.success).length;
      const response: UpsertResponse = {
        success: errorCount === 0,
        message:
          errorCount === 0
            ? 'All disciplinari processed successfully'
            : `Processed with ${errorCount} errors`,
        totalProcessed: allResults.length,
        successCount,
        errorCount,
        results: allResults,
      };
      console.log(
        `[VectorSearchController] MongoDB upsert completed: ${successCount} success, ${errorCount} errors`,
      );
      return res.status(errorCount === 0 ? 200 : 207).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VectorSearchController] Fatal error: ${message}`);
      return res.status(500).json({
        success: false,
        message: `Fatal error: ${message}`,
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        results: [],
      });
    } finally {
      if (service) {
        await service.disconnect();
      }
    }
  }

  /**
   * Endpoint per l'upsert dei disciplinari su Qdrant
   * POST /vector-search/upsert-disciplinari-qdrant
   */
  public async upsertDisciplinariQdrant(_req: Request, res: Response): Promise<Response> {
    try {
      console.log('[VectorSearchController] Starting Qdrant upsert process...');
      const records = this.readDisciplinariCsv();
      console.log(`[VectorSearchController] Found ${records.length} disciplinari to process`);
      const service = createVectorSearchQdrantService('disciplinari_bdf');
      const allResults: ProcessingResult[] = [];
      for (let i = 0; i < records.length; i += this.batchSize) {
        const batch = records.slice(i, i + this.batchSize);
        const batchNumber = Math.floor(i / this.batchSize) + 1;
        const totalBatches = Math.ceil(records.length / this.batchSize);
        console.log(
          `[VectorSearchController] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`,
        );
        const batchResults = await this.processBatch(service, batch);
        allResults.push(...batchResults);
        console.log(`[VectorSearchController] Batch ${batchNumber}/${totalBatches} completed`);
      }
      const successCount = allResults.filter((r) => r.success).length;
      const errorCount = allResults.filter((r) => !r.success).length;
      const response: UpsertResponse = {
        success: errorCount === 0,
        message:
          errorCount === 0
            ? 'All disciplinari processed successfully'
            : `Processed with ${errorCount} errors`,
        totalProcessed: allResults.length,
        successCount,
        errorCount,
        results: allResults,
      };
      console.log(
        `[VectorSearchController] Qdrant upsert completed: ${successCount} success, ${errorCount} errors`,
      );
      return res.status(errorCount === 0 ? 200 : 207).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VectorSearchController] Fatal error: ${message}`);
      return res.status(500).json({
        success: false,
        message: `Fatal error: ${message}`,
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        results: [],
      });
    }
  }

  /**
   * Endpoint di diagnostica per verificare lo stato della collection MongoDB
   * GET /vector-search/check-mongodb-status
   */
  public async checkMongoDBStatus(_req: Request, res: Response): Promise<Response> {
    const { MongoClient } = await import('mongodb');
    let client: InstanceType<typeof MongoClient> | null = null;

    try {
      console.log('[VectorSearchController] Checking MongoDB status...');

      const mongoUri = process.env.MONGODB_VECTOR_URI;
      const databaseName = process.env.MONGODB_VECTOR_DB;

      if (!mongoUri || !databaseName) {
        return res.status(500).json({
          success: false,
          message: 'MongoDB environment variables not configured',
          mongoUri: !!mongoUri,
          databaseName: !!databaseName,
        });
      }

      client = new MongoClient(mongoUri);
      await client.connect();
      const db = client.db(databaseName);
      const collection = db.collection('disciplinari_bdf');

      // Conta i documenti
      const documentCount = await collection.countDocuments();
      console.log(`[VectorSearchController] Found ${documentCount} documents`);

      // Verifica se esiste l'indice vettoriale
      const indexes = await collection.listIndexes().toArray();
      const hasVectorIndex = indexes.some((idx) => idx.name === 'vector_index');

      // Prendi un documento di esempio
      const sampleDoc = await collection.findOne({});

      return res.status(200).json({
        success: true,
        message: 'MongoDB connection successful',
        collectionName: 'disciplinari_bdf',
        documentCount,
        hasVectorIndex,
        indexes: indexes.map((idx) => idx.name),
        sampleDocumentKeys: sampleDoc ? Object.keys(sampleDoc) : [],
        hasSampleDocument: !!sampleDoc,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VectorSearchController] MongoDB status check error: ${message}`);
      return res.status(500).json({
        success: false,
        message: `MongoDB status check failed: ${message}`,
      });
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  /**
   * Endpoint per la ricerca semantica su MongoDB
   * POST /vector-search/get-answer-mongodb
   * Body: { query: string, limit?: number }
   */
  public async getAnswerMongoDB(req: Request, res: Response): Promise<Response> {
    let service: VectorSearchMongoDBService | null = null;
    try {
      const { query, limit } = req.body as SearchRequest;

      console.log('[VectorSearchController] Received request:', { query, limit });

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        console.log('[VectorSearchController] Invalid query');
        return res.status(400).json({
          success: false,
          message: 'Query is required and must be a non-empty string',
        });
      }

      const searchLimit = limit && Number.isInteger(limit) && limit > 0 ? limit : 5;
      console.log(
        `[VectorSearchController] MongoDB search query: "${query}" (limit: ${searchLimit})`,
      );

      service = createVectorSearchMongoDBService('disciplinari_bdf');
      console.log('[VectorSearchController] Service created, executing search...');

      const searchResults = await service.vectorSearch(query, searchLimit, true);
      console.log(`[VectorSearchController] Search returned ${searchResults.length} results`);

      const formattedResults = searchResults.map((result: MongoSearchResult) => ({
        content: result.text,
        score: result.score,
        source: result.metadata.source,
        chunkIndex: result.metadata.chunkIndex,
        sourceType: result.metadata.sourceType,
      }));

      const response: SearchResponse = {
        success: true,
        query,
        limit: searchLimit,
        resultsCount: formattedResults.length,
        results: formattedResults,
      };

      console.log(
        `[VectorSearchController] MongoDB search completed: ${formattedResults.length} results found`,
      );
      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : '';
      console.error(`[VectorSearchController] MongoDB search error: ${message}`);
      console.error(`[VectorSearchController] Stack trace: ${stack}`);
      return res.status(500).json({
        success: false,
        message: `Search error: ${message}`,
      });
    } finally {
      if (service) {
        console.log('[VectorSearchController] Disconnecting service...');
        await service.disconnect();
      }
    }
  }

  /**
   * Endpoint per la ricerca semantica su Qdrant
   * POST /vector-search/get-answer-qdrant
   * Body: { query: string, limit?: number }
   */
  public async getAnswerQdrant(req: Request, res: Response): Promise<Response> {
    try {
      const { query, limit } = req.body as SearchRequest;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Query is required and must be a non-empty string',
        });
      }
      const searchLimit = limit && Number.isInteger(limit) && limit > 0 ? limit : 5;
      console.log(
        `[VectorSearchController] Qdrant search query: "${query}" (limit: ${searchLimit})`,
      );
      const service = createVectorSearchQdrantService('disciplinari_bdf');
      const searchResults = await service.similaritySearchWithScore(query, searchLimit);
      const formattedResults = searchResults.map((result) => {
        const [doc, score] = result;
        return {
          content: doc.pageContent,
          score,
          source: doc.metadata.source as string,
          chunkIndex: doc.metadata.chunkIndex as number,
          sourceType: doc.metadata.sourceType as string,
        };
      });
      const response: SearchResponse = {
        success: true,
        query,
        limit: searchLimit,
        resultsCount: formattedResults.length,
        results: formattedResults,
      };
      console.log(
        `[VectorSearchController] Qdrant search completed: ${formattedResults.length} results found`,
      );
      return res.status(200).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VectorSearchController] Qdrant search error: ${message}`);
      return res.status(500).json({
        success: false,
        message: `Search error: ${message}`,
      });
    }
  }
}
