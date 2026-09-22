import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { prisma } from '../repositories/Prisma';
import { FileUploadAdapter } from '../services/tool/fileUpload.adapter';
import { LangChainUsageCollector, UsageAccumulator, CostCalculator, OpenAiPricingRegistry } from '../services/llm_costs/usage';
import { PrismaUserRepository } from '../repositories/PrismaUserRepository';
import { DeductUserCreditsUseCase } from '../../application/use-cases/user/DeductUserCreditsUseCase';
import { decompressIfNeeded, CompressedData } from '../utils/redis-compression.util';
import { extractStructuredDisciplinariData, calculateFileHash, extractValidityDatesFromText, isDisciplinareExpired } from '../services/tool/extractDataFromDisciplinari';
import { DisciplinariExtractionResult } from '../../domain/dtos/disciplinari.dto';
import { pdfToText } from '../services/ocr/pdfToText';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';
import { pMap, isUsableDisciplinariExtraction, DisciplinariExtractionJobData, QUEUE_NAME } from './disciplinari-extraction-queue.support';
import type { DisciplinariExtractionQueueContext } from './disciplinari-extraction-queue.context';

export function disciplinariExtractionQueueStartWorker(this: DisciplinariExtractionQueueContext): void {
    if (this.worker) {
      console.log('[DISCIPLINARI-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<DisciplinariExtractionJobData>>) => {
        console.log(`[DISCIPLINARI-QUEUE] Processing job ${job.id}`);
        try {
          await job.updateProgress(0);
          const jobData = decompressIfNeeded(job.data);
          console.log(`[DISCIPLINARI-QUEUE] Job data decompressed, files: ${jobData.files.length}`);

          const userExists = await ensureUserOrSkip(jobData.userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${jobData.userId} no longer exists`);
          }

          const fileService = new FileUploadAdapter();
          const usage = new UsageAccumulator();
          const collector = new LangChainUsageCollector(usage);
          const model = process.env.OPENAI_MODEL || 'gpt-4o';
          const pricing = OpenAiPricingRegistry.getPricing(model);

          const totalFiles = jobData.files.length;
          const FILE_CONCURRENCY = Math.min(jobData.concurrency ?? 3, 5);
          let processedCount = 0;

          console.log(
            `[DISCIPLINARI-QUEUE] Processing ${totalFiles} files with concurrency ${FILE_CONCURRENCY}`,
          );

          const processFile = async (file: {
            fileName: string;
            pdfBuffer: Buffer | { type: 'Buffer'; data: number[] };
          }): Promise<DisciplinariExtractionResult> => {
            try {
              const pdfBuffer = Buffer.isBuffer(file.pdfBuffer)
                ? file.pdfBuffer
                : Buffer.from(file.pdfBuffer.data);

              const fileHash = calculateFileHash(pdfBuffer);
              console.log(
                `[DISCIPLINARI-QUEUE] Processing file: ${file.fileName}, hash: ${fileHash.substring(0, 16)}...`,
              );

              const existingExtraction = await prisma.disciplinariExtraction.findUnique({
                where: { fileHash },
              });

              if (existingExtraction && !jobData.forceReExtract) {
                const isExpiredCheck = isDisciplinareExpired(existingExtraction.validUntil);

                if (!isExpiredCheck) {
                  console.log(
                    `[DISCIPLINARI-QUEUE] File ${file.fileName} already extracted and valid, skipping`,
                  );
                  processedCount++;
                  await job.updateProgress(Math.round(10 + (processedCount / totalFiles) * 80));
                  return {
                    fileName: file.fileName,
                    status: 'cached',
                    fileHash,
                    bucketUrl: existingExtraction.sourceUrl,
                    data: existingExtraction.extractedData as never,
                    error: null,
                  };
                } else {
                  console.log(`[DISCIPLINARI-QUEUE] File ${file.fileName} expired, re-extracting`);
                }
              }

              console.log(`[DISCIPLINARI-QUEUE] Uploading file ${file.fileName} to bucket`);
              const bucketUrl = await fileService.uploadPdfToStorage(
                pdfBuffer,
                file.fileName,
                jobData.userId,
              );

              console.log(`[DISCIPLINARI-QUEUE] Extracting text from ${file.fileName}`);
              const textResult = await pdfToText(pdfBuffer);
              const rawText = textResult.text;

              if (!rawText || rawText.trim().length === 0) {
                console.error(`[DISCIPLINARI-QUEUE] Failed to extract text from ${file.fileName}`);
                processedCount++;
                await job.updateProgress(Math.round(10 + (processedCount / totalFiles) * 80));
                return {
                  fileName: file.fileName,
                  status: 'failed',
                  fileHash,
                  bucketUrl,
                  data: null,
                  error: 'Failed to extract text from PDF',
                };
              }

              console.log(`[DISCIPLINARI-QUEUE] Extracting structured data from ${file.fileName}`);
              const extractedData = await extractStructuredDisciplinariData(rawText, [collector], {
                userId: jobData.userId,
                jobId: String(job.id ?? 'unknown-job'),
                jobGroupId: String(job.id ?? 'unknown-group'),
              });
              if (!isUsableDisciplinariExtraction(extractedData)) {
                console.warn(
                  `[DISCIPLINARI-QUEUE] Extraction for ${file.fileName} returned no usable rules - NOT saving`,
                );
                processedCount++;
                await job.updateProgress(Math.round(10 + (processedCount / totalFiles) * 80));
                return {
                  fileName: file.fileName,
                  status: 'failed',
                  fileHash,
                  bucketUrl,
                  data: null,
                  error: 'Extraction returned no usable disciplinari data',
                };
              }

              const preExtractedDates = extractValidityDatesFromText(rawText);
              if (preExtractedDates.validFrom && !extractedData.documentMetadata.validFrom) {
                (extractedData.documentMetadata as unknown as Record<string, unknown>).validFrom =
                  preExtractedDates.validFrom;
              }
              if (preExtractedDates.validUntil && !extractedData.documentMetadata.validUntil) {
                (extractedData.documentMetadata as unknown as Record<string, unknown>).validUntil =
                  preExtractedDates.validUntil;
              }
              if (preExtractedDates.year && !extractedData.documentMetadata.year) {
                (extractedData.documentMetadata as unknown as Record<string, unknown>).year =
                  preExtractedDates.year;
              }

              const validFrom = extractedData.documentMetadata.validFrom
                ? new Date(extractedData.documentMetadata.validFrom)
                : null;
              const validUntil = extractedData.documentMetadata.validUntil
                ? new Date(extractedData.documentMetadata.validUntil)
                : null;
              const isExpired = isDisciplinareExpired(validUntil);

              console.log(`[DISCIPLINARI-QUEUE] Saving extraction for ${file.fileName}`);
              const status: 'extracted' | 'expired_updated' = existingExtraction
                ? 'expired_updated'
                : 'extracted';

              await prisma.disciplinariExtraction.upsert({
                where: { fileHash },
                create: {
                  fileHash,
                  fileName: file.fileName,
                  sourceUrl: bucketUrl,
                  region: extractedData.documentMetadata.region,
                  year: extractedData.documentMetadata.year,
                  version: extractedData.documentMetadata.version,
                  title: extractedData.documentMetadata.title,
                  validFrom,
                  validUntil,
                  isExpired,
                  rawText,
                  extractedData: extractedData as never,
                  extractionConfidence: extractedData.extractionConfidence,
                  extractionErrors: extractedData.extractionErrors as string[],
                  createdById: jobData.userId,
                },
                update: {
                  fileName: file.fileName,
                  sourceUrl: bucketUrl,
                  region: extractedData.documentMetadata.region,
                  year: extractedData.documentMetadata.year,
                  version: extractedData.documentMetadata.version,
                  title: extractedData.documentMetadata.title,
                  validFrom,
                  validUntil,
                  isExpired,
                  rawText,
                  extractedData: extractedData as never,
                  extractionConfidence: extractedData.extractionConfidence,
                  extractionErrors: extractedData.extractionErrors as string[],
                },
              });

              processedCount++;
              await job.updateProgress(Math.round(10 + (processedCount / totalFiles) * 80));
              console.log(`[DISCIPLINARI-QUEUE] Successfully processed ${file.fileName}`);

              return {
                fileName: file.fileName,
                status,
                fileHash,
                bucketUrl,
                data: extractedData,
                error: null,
              };
            } catch (fileError) {
              console.error(`[DISCIPLINARI-QUEUE] Error processing ${file.fileName}:`, fileError);
              processedCount++;
              await job.updateProgress(Math.round(10 + (processedCount / totalFiles) * 80));
              return {
                fileName: file.fileName,
                status: 'failed',
                fileHash: null,
                bucketUrl: null,
                data: null,
                error: fileError instanceof Error ? fileError.message : 'Unknown error',
              };
            }
          };

          const results = await pMap(jobData.files, processFile, FILE_CONCURRENCY);
          let totalExtracted = 0;
          let totalCached = 0;
          let totalFailed = 0;
          for (const r of results) {
            if (r.status === 'cached') totalCached++;
            else if (r.status === 'failed') totalFailed++;
            else totalExtracted++;
          }

          await job.updateProgress(90);

          const tokens = usage.getTotals();
          const cost = CostCalculator.computeCost({
            tokens,
            pricing,
            mistralOcrPages: 0,
            margin: 0.2,
          });

          const userRepository = new PrismaUserRepository(prisma);
          const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
          try {
            await deductCreditsUseCase.execute({
              userId: jobData.userId,
              amount: cost.costWithMarginUsd,
            });
            console.log(
              `[DISCIPLINARI-QUEUE] Deducted ${cost.costWithMarginUsd} credits from user ${jobData.userId}`,
            );
          } catch (error) {
            console.error(`[DISCIPLINARI-QUEUE] Failed to deduct credits:`, error);
          }

          await job.updateProgress(100);
          console.log(`[DISCIPLINARI-QUEUE] Job ${job.id} completed successfully`);

          return {
            results,
            totalProcessed: totalFiles,
            totalExtracted,
            totalCached,
            totalFailed,
            cost: {
              inputTokens: cost.tokens.promptTokens,
              outputTokens: cost.tokens.completionTokens,
              totalCostUsd: cost.totalCostUsd,
              costWithMarginUsd: cost.costWithMarginUsd,
            },
          };
        } catch (error) {
          console.error(`[DISCIPLINARI-QUEUE] Job ${job.id} failed:`, error);
          throw error;
        }
      },
      {
        connection,
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`[DISCIPLINARI-QUEUE] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[DISCIPLINARI-QUEUE] Job ${job?.id} failed with error:`, err);
    });

    console.log('[DISCIPLINARI-QUEUE] Worker started');
  }
