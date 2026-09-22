import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { prisma } from '../repositories/Prisma';
import { HybridPdfParserService } from '../services/ocr/hybrid-pdf-parser';
import { FileService } from '../services/FileService';
import { createVectorSearchQdrantService } from '../services/tool/vectorSearchQdrant';
import {
  createTableAwareTextSplitter,
  TableAwareChunk,
} from '../services/rag/TableAwareTextSplitter';
import {
  VectorizationJobData,
  VectorizationJobResult,
  RULES_QDRANT_COLLECTION,
  RuleVectorMetadata,
} from '../../domain/dtos/rule-rag.types';
import { ensureUserOrSkip } from './helpers/userGuard';

const QUEUE_NAME = 'rule-pdf-vectorization';

// Legacy chunk sizes (used for non-disciplinare documents)
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 250;

// Table-aware chunk sizes (used for disciplinare documents)
const TABLE_CHUNK_SIZE = 4000;
const TEXT_CHUNK_SIZE = 1500;
const TABLE_OVERLAP = 300;

export class RulePdfVectorizationQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }
  /**
   * Adds a vectorization job to the queue.
   * @param data Job data containing rule and PDF information
   * @returns Job ID
   */
  async addJob(data: VectorizationJobData): Promise<string> {
    const job = await this.queue.add('vectorize-rule-pdf', data, {
      removeOnComplete: { age: 7200, count: 200 },
      removeOnFail: { age: 14400, count: 500 },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
    console.log(`[RULE-VECTORIZATION] Job ${job.id} added for rule ${data.ruleId}`);
    return job.id!;
  }
  /**
   * Gets the status of a vectorization job.
   * @param jobId Job ID to check
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    result?: VectorizationJobResult;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    const progress = job.progress as number;
    return {
      id: job.id!,
      state,
      progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }
  /**
   * Starts the background worker for processing vectorization jobs.
   */
  startWorker(): void {
    if (this.worker) {
      console.log('[RULE-VECTORIZATION] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<VectorizationJobData>) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: 2,
        limiter: {
          max: 5,
          duration: 60000,
        },
      },
    );
    this.worker.on('completed', (job) => {
      console.log(`[RULE-VECTORIZATION] Job ${job.id} completed for rule ${job.data.ruleId}`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(
        `[RULE-VECTORIZATION] Job ${job?.id} failed for rule ${job?.data.ruleId}: ${err.message}`,
      );
    });
    console.log('[RULE-VECTORIZATION] Worker started');
  }
  /**
   * Processes a single vectorization job.
   */
  private async processJob(job: Job<VectorizationJobData>): Promise<VectorizationJobResult> {
    const startTime = Date.now();
    const { ruleId, pdfFileUrl, workspaceId, userId, ruleName, category, region } = job.data;
    console.log(`[RULE-VECTORIZATION] Processing rule ${ruleId}: ${ruleName}`);
    try {
      await job.updateProgress(10);
      const userExists = await ensureUserOrSkip(userId, prisma, {
        jobId: job.id,
        queueName: QUEUE_NAME,
      });
      if (!userExists) {
        return {
          ruleId,
          chunksCount: 0,
          collectionName: RULES_QDRANT_COLLECTION,
          processingTimeMs: Date.now() - startTime,
          parsingMethod: 'skipped-user-missing',
        } satisfies VectorizationJobResult;
      }
      const fileService = new FileService(userId);
      const multerFile = await fileService.getFileFromUrl(pdfFileUrl);
      const pdfBuffer = multerFile.buffer;
      console.log(`[RULE-VECTORIZATION] Downloaded PDF: ${pdfBuffer.length} bytes`);
      await job.updateProgress(20);
      const parser = new HybridPdfParserService();
      const parsedResult = await parser.parseComplexPdf(pdfBuffer, pdfFileUrl);
      console.log(
        `[RULE-VECTORIZATION] Parsed PDF: ${parsedResult.text.length} chars, ` +
          `method=${parsedResult.metadata.method}, quality=${parsedResult.metadata.quality}`,
      );
      if (!parsedResult.text || parsedResult.text.trim().length === 0) {
        await this.markVectorizationError(ruleId, 'No text could be extracted from PDF');
        throw new Error('No text extracted from PDF');
      }
      await job.updateProgress(40);
      // Use table-aware splitter for DISCIPLINARE documents, legacy splitter for others
      let documents: Document[];
      if (category === 'DISCIPLINARE') {
        // Use table-aware chunking for disciplinari (preserves table structure)
        console.log(`[RULE-VECTORIZATION] Using table-aware splitter for DISCIPLINARE`);
        const tableAwareSplitter = createTableAwareTextSplitter({
          maxTableChunkSize: TABLE_CHUNK_SIZE,
          maxTextChunkSize: TEXT_CHUNK_SIZE,
          overlap: TABLE_OVERLAP,
        });
        const tableAwareChunks: TableAwareChunk[] = await tableAwareSplitter.splitText(
          parsedResult.text,
        );
        console.log(`[RULE-VECTORIZATION] Created ${tableAwareChunks.length} table-aware chunks`);
        const metadata: RuleVectorMetadata = {
          ruleId,
          workspaceId,
          category: category,
          region: region,
          sourceType: 'rule_pdf',
          ruleName,
        };
        documents = tableAwareChunks.map((chunk) => ({
          pageContent: chunk.content,
          metadata: {
            ...metadata,
            chunkIndex: chunk.metadata.chunkIndex,
            totalChunks: tableAwareChunks.length,
            chunkType: chunk.metadata.type, // 'table' or 'text'
            tableHeaders: chunk.metadata.tableHeaders,
            sectionName: chunk.metadata.sectionName,
            page: chunk.metadata.pageNumber,
            parsingMethod: parsedResult.metadata.method,
            parsingQuality: parsedResult.metadata.quality,
            createdAt: new Date().toISOString(),
          },
        }));
      } else {
        // Use legacy chunking for non-disciplinare documents
        console.log(`[RULE-VECTORIZATION] Using legacy splitter for ${category}`);
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: CHUNK_SIZE,
          chunkOverlap: CHUNK_OVERLAP,
          separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ' ', ''],
          keepSeparator: true,
        });
        const chunks = await textSplitter.splitText(parsedResult.text);
        console.log(`[RULE-VECTORIZATION] Created ${chunks.length} legacy chunks`);
        const metadata: RuleVectorMetadata = {
          ruleId,
          workspaceId,
          category: category,
          region: region,
          sourceType: 'rule_pdf',
          ruleName,
        };
        documents = chunks.map((chunk, index) => ({
          pageContent: chunk,
          metadata: {
            ...metadata,
            chunkIndex: index,
            totalChunks: chunks.length,
            parsingMethod: parsedResult.metadata.method,
            parsingQuality: parsedResult.metadata.quality,
            createdAt: new Date().toISOString(),
          },
        }));
      }
      await job.updateProgress(50);
      await job.updateProgress(60);
      const vectorService = createVectorSearchQdrantService(RULES_QDRANT_COLLECTION);
      await vectorService.addDocuments(documents);
      console.log(`[RULE-VECTORIZATION] Stored ${documents.length} vectors in Qdrant`);
      await job.updateProgress(80);
      // Ensure payload indexes exist for filtering
      await vectorService.ensurePayloadIndexes();
      await job.updateProgress(90);
      await this.markVectorizationSuccess(ruleId);
      await job.updateProgress(100);
      const processingTimeMs = Date.now() - startTime;
      console.log(`[RULE-VECTORIZATION] Rule ${ruleId} vectorized in ${processingTimeMs}ms`);
      return {
        ruleId,
        chunksCount: documents.length,
        collectionName: RULES_QDRANT_COLLECTION,
        processingTimeMs,
        parsingMethod: parsedResult.metadata.method,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[RULE-VECTORIZATION] Error processing rule ${ruleId}: ${errorMessage}`);
      await this.markVectorizationError(ruleId, errorMessage);
      throw err;
    }
  }
  /**
   * Marks a rule as successfully vectorized in the database.
   */
  private async markVectorizationSuccess(ruleId: string): Promise<void> {
    await prisma.rule.update({
      where: { id: ruleId },
      data: {
        isVectorized: true,
        vectorizedAt: new Date(),
        vectorizationError: null,
        qdrantCollection: RULES_QDRANT_COLLECTION,
      },
    });
  }
  /**
   * Marks a rule vectorization as failed in the database.
   */
  private async markVectorizationError(ruleId: string, error: string): Promise<void> {
    await prisma.rule.update({
      where: { id: ruleId },
      data: {
        isVectorized: false,
        vectorizationError: error.substring(0, 500),
      },
    });
  }
  /**
   * Stops the worker gracefully.
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[RULE-VECTORIZATION] Worker stopped');
    }
  }
}
/** Singleton instance for the vectorization queue */
let queueInstance: RulePdfVectorizationQueue | null = null;
/**
 * Gets or creates the singleton instance of the vectorization queue.
 */
export function getRulePdfVectorizationQueue(): RulePdfVectorizationQueue {
  if (!queueInstance) {
    queueInstance = new RulePdfVectorizationQueue();
  }
  return queueInstance;
}
