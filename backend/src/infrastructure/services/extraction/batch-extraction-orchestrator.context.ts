import { CompanyKind } from '@prisma/client';
import { type Server as SocketServer } from 'socket.io';
import { type IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { type IFileExtractionRepository, type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type IFileRepository } from '../../../domain/repositories/IFileRepository';
import { type ResolvedCategory, type BatchExtractionCategory, type ExtractionData, type ProductionUnitPreview, type FieldsExtractionData, type ProductionUnitsExtractionData, type AgriculturalExtractionData, type InvoiceExtractionData, type DdtExtractionData, type StockExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { type ProductionUnitRaw } from '../agents/production_unit/production_unit_csv_agent';
import { type ResolvedFileCategory } from './file-category-resolver';
import { type LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { MulterFileInput, StartBatchParams, BatchExtractionDependencies } from './batch-extraction-orchestrator.support';
import { FileService } from '../FileService';

export interface BatchExtractionOrchestratorContext {
  readonly fileService: FileService;
  readonly fieldRepository: IFieldRepository;
  readonly fileExtractionRepository: IFileExtractionRepository;
  readonly fileRepository: IFileRepository;
  readonly logEditUseCase: LogFileExtractionEditUseCase | null;
  readonly dependencies: BatchExtractionDependencies;
  startBatch(params: StartBatchParams): Promise<{
    batchId: string;
    extractions: FileExtractionRecord[];
  }>;
  prepareSingleExtraction(args: {
    file: MulterFileInput;
    fileIndex: number;
    userCategory: BatchExtractionCategory;
    batchId: string;
    companyId: string;
    userId: string;
  }): Promise<FileExtractionRecord>;
  uploadFile(file: MulterFileInput, userId: string): Promise<string>;
  runExtractionsInBackground(files: readonly MulterFileInput[], extractions: FileExtractionRecord[], userCategories: readonly BatchExtractionCategory[], companyId: string, batchId: string): void;
  processQueuedFile(args: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    extractionId: string;
    batchId: string;
    companyId: string;
    userCategory: BatchExtractionCategory;
  }): Promise<void>;
  maybeEmitBatchDone(batchId: string): Promise<void>;
  processOneFile(file: MulterFileInput, extraction: FileExtractionRecord, wasAutoDetected: boolean, companyId: string, io: SocketServer | null, room: string, batchId: string): Promise<void>;
  resolveWithPdfText(file: MulterFileInput, currentCategory: ResolvedCategory, wasAutoDetected: boolean): Promise<ResolvedFileCategory>;
  emitProgress(io: SocketServer | null, room: string, extraction: FileExtractionRecord, progress: number, batchId: string): void;
  extractData(file: MulterFileInput, resolved: ResolvedFileCategory, companyId: string, onProgress: (progress: number) => void): Promise<ExtractionData>;
  extractFields(file: MulterFileInput, fileFormat: string, companyId: string): Promise<FieldsExtractionData>;
  extractFieldsFromShapefile(buffer: Buffer, companyId: string, fileName: string): Promise<FieldsExtractionData>;
  extractFieldsFromGeojson(buffer: Buffer, companyId: string): Promise<FieldsExtractionData>;
  extractProductionUnits(file: MulterFileInput, fileFormat: string, companyId: string, onProgress: (progress: number) => void): Promise<ProductionUnitsExtractionData>;
  extractAgricultural(file: MulterFileInput, fileFormat: string, companyId: string, onProgress: (progress: number) => void): Promise<AgriculturalExtractionData>;
  extractInvoice(file: MulterFileInput, onProgress: (progress: number) => void, companyId: string): Promise<InvoiceExtractionData>;
  extractDdt(file: MulterFileInput, onProgress: (progress: number) => void, companyId: string): Promise<DdtExtractionData>;
  extractStock(_file: MulterFileInput, onProgress: (progress: number) => void): Promise<StockExtractionData>;
  resolveCompanyKind(companyId: string): Promise<CompanyKind>;
  buildPuPreviews(rawUnits: ProductionUnitRaw[], companyId: string): Promise<ProductionUnitPreview[]>;
}
