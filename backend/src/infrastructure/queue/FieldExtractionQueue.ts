import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { FieldCsvAgent } from '../services/agents/file_agent/field_csv_agent';
import { PianoColturalePdfAgent } from '../services/agents/file_agent/piano_colturale_pdf_agent';
import { type ExtractionDiagnostics } from '../services/agents/file_agent/utils/csv_parser';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
  calculateSizeInMB,
} from '../utils/redis-compression.util';
import { prisma } from '../repositories/Prisma';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';

export interface FieldExtractionJobData {
  fileBuffer: Buffer | { type: 'Buffer'; data: number[] };
  companyId: string;
  userId: string;
  originalName?: string;
  mimeType?: string;
}

export interface FieldExtractionJobField {
  companyId: string;
  name: string;
  coordinates: number[];
  latitude: number | null;
  longitude: number | null;
  polygon: unknown | null;
  gisHa: number | null;
  sauHa: number | null;
  ph: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  calcium: number | null;
  magnesium: number | null;
  soilType: string | null;
  uso: string | null;
  qualita: string | null;
  superficieCatastaleMq: number | null;
  sezione: string | null;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  nation: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  cap: string | null;
  variazioneMq: string | null;
  inizioConduzione: string | null;
  fineConduzione: string | null;
}

export interface FieldExtractionJobResult {
  status: 'completed' | 'failed';
  fields: FieldExtractionJobField[];
  extractedCount: number;
  errors: string[];
  diagnostics?: ExtractionDiagnostics;
}

const QUEUE_NAME = 'field-extraction';

export class FieldExtractionQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async addJob(data: FieldExtractionJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[FIELD-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);

    const job = await this.queue.add('extract-fields', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(`[FIELD-QUEUE] Job ${job.id} added to queue`);
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    message?: string;
    result?: FieldExtractionJobResult;
    failedReason?: string;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();

    let progress = 0;
    let message: string | undefined;

    const rawProgress = job.progress;
    if (typeof rawProgress === 'object' && rawProgress !== null) {
      const obj = rawProgress as { percent?: number; message?: string };
      progress = obj.percent ?? 0;
      message = obj.message;
    } else {
      progress = typeof rawProgress === 'number' ? rawProgress : 0;
    }

    return {
      id: job.id!,
      state,
      progress,
      message,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  startWorker(): void {
    if (this.worker) {
      console.log('[FIELD-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<FieldExtractionJobData>>) => {
        console.log(`[FIELD-QUEUE] Processing job ${job.id}`);
        try {
          await job.updateProgress(0);
          const jobData = decompressIfNeeded(job.data);

          const userExists = await ensureUserOrSkip(jobData.userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${jobData.userId} no longer exists`);
          }

          const buffer = Buffer.isBuffer(jobData.fileBuffer)
            ? jobData.fileBuffer
            : Buffer.from(jobData.fileBuffer.data);

          const isPdf =
            jobData.originalName?.toLowerCase().endsWith('.pdf') ||
            jobData.mimeType === 'application/pdf';

          await job.updateProgress({
            percent: 5,
            message: isPdf ? 'Analisi PDF...' : 'Analisi file...',
          });

          console.log(
            `[FIELD-QUEUE] Extracting fields from file (${isPdf ? 'PDF' : 'CSV/Excel'})...`,
          );

          let extractionResult: {
            fields: import('../services/agents/file_agent/field_csv_agent').ExtractedFieldData['fields'];
            diagnostics?: ExtractionDiagnostics;
          };

          if (isPdf) {
            const pdfAgent = new PianoColturalePdfAgent();
            const pdfResult = await pdfAgent.extractFromPdf(buffer, (chunkIndex, totalChunks) => {
              const done = chunkIndex + 1;
              const chunkPercent = Math.round(5 + (done / totalChunks) * 85);
              const msg = `Elaborazione chunk ${done}/${totalChunks}...`;
              job.updateProgress({ percent: chunkPercent, message: msg }).catch(() => {});
            });
            extractionResult = {
              fields: pdfResult.fields.fields,
              diagnostics: pdfResult.fields.diagnostics,
            };
          } else {
            await job.updateProgress({ percent: 20, message: 'Estrazione dati...' });
            const csvAgent = new FieldCsvAgent();
            extractionResult = await csvAgent.extractFieldsFromCsv(buffer);
          }

          console.log(`[FIELD-QUEUE] Extracted ${extractionResult.fields.length} fields`);

          await job.updateProgress({ percent: 92, message: 'Normalizzazione campi...' });

          // Normalize extracted fields for preview (without saving to database)
          const normalizedFields: FieldExtractionJobField[] = extractionResult.fields.map((dto) => {
            const normalizeNullableNumber = (value: number | null | undefined): number | null => {
              return typeof value === 'number' ? value : null;
            };

            const normalizeNullableString = (value: string | null | undefined): string | null => {
              if (typeof value !== 'string') {
                return null;
              }
              const trimmed = value.trim();
              return trimmed.length > 0 ? trimmed : null;
            };

            const normalizeName = (value: string | null | undefined): string => {
              if (typeof value !== 'string') {
                return 'Unnamed field';
              }
              const trimmed = value.trim();
              return trimmed.length > 0 ? trimmed : 'Unnamed field';
            };

            return {
              companyId: jobData.companyId,
              name: normalizeName(dto.name),
              coordinates: [],
              latitude: normalizeNullableNumber(dto.latitude),
              longitude: normalizeNullableNumber(dto.longitude),
              polygon: null,
              gisHa: normalizeNullableNumber(dto.gisHa),
              sauHa: normalizeNullableNumber(dto.sauHa),
              ph: normalizeNullableNumber(dto.ph),
              nitrogen: normalizeNullableNumber(dto.nitrogen),
              phosphorus: normalizeNullableNumber(dto.phosphorus),
              potassium: normalizeNullableNumber(dto.potassium),
              calcium: normalizeNullableNumber(dto.calcium),
              magnesium: normalizeNullableNumber(dto.magnesium),
              soilType: normalizeNullableString(dto.soilType),
              uso: normalizeNullableString(dto.uso),
              qualita: normalizeNullableString(dto.qualita),
              superficieCatastaleMq: normalizeNullableNumber(dto.superficieCatastaleMq),
              sezione: normalizeNullableString(dto.sezione),
              foglio: normalizeNullableString(dto.foglio),
              particella: normalizeNullableString(dto.particella),
              subalterno: normalizeNullableString(dto.subalterno),
              nation: normalizeNullableString(dto.nation),
              region: normalizeNullableString(dto.region),
              city: normalizeNullableString(dto.city),
              address: normalizeNullableString(dto.address),
              cap: normalizeNullableString(dto.cap),
              variazioneMq: normalizeNullableString(dto.variazioneMq),
              inizioConduzione: normalizeNullableString(dto.inizioConduzione),
              fineConduzione: normalizeNullableString(dto.fineConduzione),
            };
          });

          await job.updateProgress({ percent: 100, message: 'Completato' });
          console.log(
            `[FIELD-QUEUE] Successfully normalized ${normalizedFields.length} fields for preview`,
          );

          return {
            status: 'completed',
            fields: normalizedFields,
            extractedCount: normalizedFields.length,
            errors: [],
            diagnostics: extractionResult.diagnostics,
          };
        } catch (error) {
          console.error(`[FIELD-QUEUE] Job ${job.id} failed:`, error);
          throw error;
        }
      },
      {
        connection,
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`[FIELD-QUEUE] Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[FIELD-QUEUE] Job ${job?.id} failed with error:`, err);
    });

    console.log('[FIELD-QUEUE] Worker started');
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[FIELD-QUEUE] Worker stopped');
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}
let queueInstance: FieldExtractionQueue | null = null;
export function getFieldExtractionQueue(): FieldExtractionQueue {
  if (!queueInstance) {
    queueInstance = new FieldExtractionQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}
