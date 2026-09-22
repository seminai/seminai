import { CompanyKind } from '@prisma/client';
import { type Server as SocketServer } from 'socket.io';
import { type IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { type IFileExtractionRepository, type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type IFileRepository } from '../../../domain/repositories/IFileRepository';
import { type ResolvedCategory, type BatchExtractionCategory, type ExtractionData, type ProductionUnitPreview, type FieldsExtractionData, type ProductionUnitsExtractionData, type AgriculturalExtractionData, type InvoiceExtractionData, type DdtExtractionData, type StockExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { type ProductionUnitRaw } from '../agents/production_unit/production_unit_csv_agent';
import { type ResolvedFileCategory } from './file-category-resolver';
import { FileService } from '../FileService';
import { type LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { MulterFileInput, StartBatchParams, BatchExtractionDependencies } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';
import { batchExtractionOrchestratorStartBatch } from './batch-extraction-orchestrator.01-start-batch';
import { batchExtractionOrchestratorPrepareSingleExtraction } from './batch-extraction-orchestrator.02-prepare-single-extraction';
import { batchExtractionOrchestratorUploadFileToGcs } from './batch-extraction-orchestrator.03-upload-file-to-gcs';
import { batchExtractionOrchestratorRunExtractionsInBackground } from './batch-extraction-orchestrator.04-run-extractions-in-background';
import { batchExtractionOrchestratorProcessQueuedFile } from './batch-extraction-orchestrator.05-process-queued-file';
import { batchExtractionOrchestratorMaybeEmitBatchDone } from './batch-extraction-orchestrator.06-maybe-emit-batch-done';
import { batchExtractionOrchestratorProcessOneFile } from './batch-extraction-orchestrator.07-process-one-file';
import { batchExtractionOrchestratorResolveWithPdfText } from './batch-extraction-orchestrator.08-resolve-with-pdf-text';
import { batchExtractionOrchestratorEmitProgress } from './batch-extraction-orchestrator.09-emit-progress';
import { batchExtractionOrchestratorExtractData } from './batch-extraction-orchestrator.10-extract-data';
import { batchExtractionOrchestratorExtractFields } from './batch-extraction-orchestrator.11-extract-fields';
import { batchExtractionOrchestratorExtractFieldsFromShapefile } from './batch-extraction-orchestrator.12-extract-fields-from-shapefile';
import { batchExtractionOrchestratorExtractFieldsFromGeojson } from './batch-extraction-orchestrator.13-extract-fields-from-geojson';
import { batchExtractionOrchestratorExtractProductionUnits } from './batch-extraction-orchestrator.14-extract-production-units';
import { batchExtractionOrchestratorExtractAgricultural } from './batch-extraction-orchestrator.15-extract-agricultural';
import { batchExtractionOrchestratorExtractInvoice } from './batch-extraction-orchestrator.16-extract-invoice';
import { batchExtractionOrchestratorExtractDdt } from './batch-extraction-orchestrator.17-extract-ddt';
import { batchExtractionOrchestratorExtractStock } from './batch-extraction-orchestrator.18-extract-stock';
import { batchExtractionOrchestratorResolveCompanyKind } from './batch-extraction-orchestrator.19-resolve-company-kind';
import { batchExtractionOrchestratorBuildPuPreviews } from './batch-extraction-orchestrator.20-build-pu-previews';


export class BatchExtractionOrchestrator {

  readonly fileService = new FileService();

  constructor(
    readonly fieldRepository: IFieldRepository,
    readonly fileExtractionRepository: IFileExtractionRepository,
    readonly fileRepository: IFileRepository,
    readonly logEditUseCase: LogFileExtractionEditUseCase | null = null,
    readonly dependencies: BatchExtractionDependencies = {},
  ) {}

  /** Creates FileExtraction records, uploads files, kicks off extractions. Returns the initial records. */
  async startBatch(params: StartBatchParams): Promise<{
    batchId: string;
    extractions: FileExtractionRecord[];
  }> {
    return batchExtractionOrchestratorStartBatch.call(this as unknown as BatchExtractionOrchestratorContext, params);
  }

  async prepareSingleExtraction(args: {
    file: MulterFileInput;
    fileIndex: number;
    userCategory: BatchExtractionCategory;
    batchId: string;
    companyId: string;
    userId: string;
  }): Promise<FileExtractionRecord> {
    return batchExtractionOrchestratorPrepareSingleExtraction.call(this as unknown as BatchExtractionOrchestratorContext, args);
  }

  async uploadFileToGcs(file: MulterFileInput, userId: string): Promise<string> {
    return batchExtractionOrchestratorUploadFileToGcs.call(this as unknown as BatchExtractionOrchestratorContext, file, userId);
  }

  runExtractionsInBackground(
    files: readonly MulterFileInput[],
    extractions: FileExtractionRecord[],
    userCategories: readonly BatchExtractionCategory[],
    companyId: string,
    batchId: string,
  ): void {
    batchExtractionOrchestratorRunExtractionsInBackground.call(this as unknown as BatchExtractionOrchestratorContext, files, extractions, userCategories, companyId, batchId);
  }

  /**
   * Process a single file dequeued from BullMQ. Loads the matching FileExtraction
   * record, runs the same pipeline used by the in-process path, and emits the
   * batch-done socket event when no extraction in the batch is still LOADING.
   */
  async processQueuedFile(args: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    extractionId: string;
    batchId: string;
    companyId: string;
    userCategory: BatchExtractionCategory;
  }): Promise<void> {
    return batchExtractionOrchestratorProcessQueuedFile.call(this as unknown as BatchExtractionOrchestratorContext, args);
  }

  async maybeEmitBatchDone(batchId: string): Promise<void> {
    return batchExtractionOrchestratorMaybeEmitBatchDone.call(this as unknown as BatchExtractionOrchestratorContext, batchId);
  }

  async processOneFile(
    file: MulterFileInput,
    extraction: FileExtractionRecord,
    wasAutoDetected: boolean,
    companyId: string,
    io: SocketServer | null,
    room: string,
    batchId: string,
  ): Promise<void> {
    return batchExtractionOrchestratorProcessOneFile.call(this as unknown as BatchExtractionOrchestratorContext, file, extraction, wasAutoDetected, companyId, io, room, batchId);
  }

  async resolveWithPdfText(
    file: MulterFileInput,
    currentCategory: ResolvedCategory,
    wasAutoDetected: boolean,
  ): Promise<ResolvedFileCategory> {
    return batchExtractionOrchestratorResolveWithPdfText.call(this as unknown as BatchExtractionOrchestratorContext, file, currentCategory, wasAutoDetected);
  }

  emitProgress(
    io: SocketServer | null,
    room: string,
    extraction: FileExtractionRecord,
    progress: number,
    batchId: string,
  ): void {
    batchExtractionOrchestratorEmitProgress.call(this as unknown as BatchExtractionOrchestratorContext, io, room, extraction, progress, batchId);
  }

  async extractData(
    file: MulterFileInput,
    resolved: ResolvedFileCategory,
    companyId: string,
    onProgress: (progress: number) => void,
  ): Promise<ExtractionData> {
    return batchExtractionOrchestratorExtractData.call(this as unknown as BatchExtractionOrchestratorContext, file, resolved, companyId, onProgress);
  }

  async extractFields(
    file: MulterFileInput,
    fileFormat: string,
    companyId: string,
  ): Promise<FieldsExtractionData> {
    return batchExtractionOrchestratorExtractFields.call(this as unknown as BatchExtractionOrchestratorContext, file, fileFormat, companyId);
  }

  async extractFieldsFromShapefile(
    buffer: Buffer,
    companyId: string,
    fileName: string,
  ): Promise<FieldsExtractionData> {
    return batchExtractionOrchestratorExtractFieldsFromShapefile.call(this as unknown as BatchExtractionOrchestratorContext, buffer, companyId, fileName);
  }

  async extractFieldsFromGeojson(
    buffer: Buffer,
    companyId: string,
  ): Promise<FieldsExtractionData> {
    return batchExtractionOrchestratorExtractFieldsFromGeojson.call(this as unknown as BatchExtractionOrchestratorContext, buffer, companyId);
  }

  async extractProductionUnits(
    file: MulterFileInput,
    fileFormat: string,
    companyId: string,
    onProgress: (progress: number) => void,
  ): Promise<ProductionUnitsExtractionData> {
    return batchExtractionOrchestratorExtractProductionUnits.call(this as unknown as BatchExtractionOrchestratorContext, file, fileFormat, companyId, onProgress);
  }

  async extractAgricultural(
    file: MulterFileInput,
    fileFormat: string,
    companyId: string,
    onProgress: (progress: number) => void,
  ): Promise<AgriculturalExtractionData> {
    return batchExtractionOrchestratorExtractAgricultural.call(this as unknown as BatchExtractionOrchestratorContext, file, fileFormat, companyId, onProgress);
  }

  async extractInvoice(
    file: MulterFileInput,
    onProgress: (progress: number) => void,
    companyId: string,
  ): Promise<InvoiceExtractionData> {
    return batchExtractionOrchestratorExtractInvoice.call(this as unknown as BatchExtractionOrchestratorContext, file, onProgress, companyId);
  }

  async extractDdt(
    file: MulterFileInput,
    onProgress: (progress: number) => void,
    companyId: string,
  ): Promise<DdtExtractionData> {
    return batchExtractionOrchestratorExtractDdt.call(this as unknown as BatchExtractionOrchestratorContext, file, onProgress, companyId);
  }

  async extractStock(
    _file: MulterFileInput,
    onProgress: (progress: number) => void,
  ): Promise<StockExtractionData> {
    return batchExtractionOrchestratorExtractStock.call(this as unknown as BatchExtractionOrchestratorContext, _file, onProgress);
  }

  async resolveCompanyKind(companyId: string): Promise<CompanyKind> {
    return batchExtractionOrchestratorResolveCompanyKind.call(this as unknown as BatchExtractionOrchestratorContext, companyId);
  }

  async buildPuPreviews(
    rawUnits: ProductionUnitRaw[],
    companyId: string,
  ): Promise<ProductionUnitPreview[]> {
    return batchExtractionOrchestratorBuildPuPreviews.call(this as unknown as BatchExtractionOrchestratorContext, rawUnits, companyId);
  }
}
