import { CompanyKind } from '@prisma/client';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import { type Server as SocketServer } from 'socket.io';
import { type IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import {
  type IFileExtractionRepository,
  type FileExtractionRecord,
} from '../../../domain/repositories/IFileExtractionRepository';
import { type IFileRepository } from '../../../domain/repositories/IFileRepository';
import { File as FileEntity } from '../../../domain/entities/File';
import {
  type ResolvedCategory,
  type BatchExtractionCategory,
  type ExtractionData,
  type ProductionUnitPreview,
  type FieldsExtractionData,
  type ProductionUnitsExtractionData,
  type AgriculturalExtractionData,
  type InvoiceExtractionData,
  type DdtExtractionData,
  type StockExtractionData,
} from '../../../domain/dtos/file-extraction.dto';
import { type ProductionUnitRaw } from '../agents/production_unit/production_unit_csv_agent';
import { resolveFileCategory, type ResolvedFileCategory } from './file-category-resolver';
import { normalizeExtractedField } from './field-normalizer';
import {
  buildFieldIndex,
  buildProductionUnitPreview,
  getCropCatalog,
} from './production-unit-normalizer';
import { FieldCsvAgent } from '../agents/file_agent/field_csv_agent';
import { ProductionUnitCsvAgent } from '../agents/production_unit/production_unit_csv_agent';
import { PianoColturalePdfAgent } from '../agents/file_agent/piano_colturale_pdf_agent';
import { ExtractDataFromInvoiceService } from '../tool/extractDataFromInvoice';
import { ExtractDataFromDdtService } from '../tool/extractDataFromDDT';
import { enrichInvoiceEntriesWithConversions } from './enrich-invoice-entries-with-conversions';
import { pdfToText } from '../ocr/pdfToText';
import { parseShapefileUpload } from './shapefile-upload-parser';
import { parsePcgGeojson } from '../pcg-geojson-parser';
import { isVenetoPcgZip, parseVenetoPcgZip } from './veneto-pcg/veneto-pcg-zip-parser';
import { mapGeoShapeRowsToRawUnits } from './map-geo-shape-rows-to-raw-units';
import { groupShapefileUploads } from './group-shapefile-uploads';
import { extractAgriculturalZipTables } from './agricultural-zip-table-extractor';
import { FileService } from '../FileService';
import { getGlobalSocketIO } from '../agents/dosage_agent_react/socket/chat-socket-emitter';
import { resolveFileFormat } from './file-format-resolver';
import { getBatchExtractionQueue } from '../../queue/BatchExtractionQueue';
import { PhaseTimer } from './phase-timer';
import { recordBatchPhaseTimings } from './extraction-telemetry';
import { type LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { prisma } from '../../repositories/Prisma';

interface MulterFileInput {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}

interface StartBatchParams {
  readonly files: readonly MulterFileInput[];
  readonly categories: readonly BatchExtractionCategory[];
  readonly companyId: string;
  readonly userId: string;
}

interface BatchExtractionDependencies {
  readonly invoiceServiceFactory?: () => ExtractDataFromInvoiceService;
  readonly ddtServiceFactory?: () => ExtractDataFromDdtService;
}

export class BatchExtractionOrchestrator {
  private readonly fileService = new FileService();

  constructor(
    private readonly fieldRepository: IFieldRepository,
    private readonly fileExtractionRepository: IFileExtractionRepository,
    private readonly fileRepository: IFileRepository,
    private readonly logEditUseCase: LogFileExtractionEditUseCase | null = null,
    private readonly dependencies: BatchExtractionDependencies = {},
  ) {}

  /** Creates FileExtraction records, uploads files, kicks off extractions. Returns the initial records. */
  async startBatch(params: StartBatchParams): Promise<{
    batchId: string;
    extractions: FileExtractionRecord[];
  }> {
    const { companyId, userId } = params;
    const groupedUploads = groupShapefileUploads(params.files, params.categories);
    const batchId = uuid();
    const extractions = await Promise.all(
      groupedUploads.map((entry, index) =>
        this.prepareSingleExtraction({
          file: entry.file,
          fileIndex: index,
          userCategory: entry.category,
          batchId,
          companyId,
          userId,
        }),
      ),
    );
    this.runExtractionsInBackground(
      groupedUploads.map((entry) => entry.file),
      extractions,
      groupedUploads.map((entry) => entry.category),
      companyId,
      batchId,
    );
    return { batchId, extractions };
  }

  private async prepareSingleExtraction(args: {
    file: MulterFileInput;
    fileIndex: number;
    userCategory: BatchExtractionCategory;
    batchId: string;
    companyId: string;
    userId: string;
  }): Promise<FileExtractionRecord> {
    const { file, fileIndex, userCategory, batchId, companyId, userId } = args;
    const totalStart = Date.now();
    const timer = new PhaseTimer();
    const resolved = await resolveFileCategory({
      userCategory,
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
    });
    timer.lap('categoryResolveMs');
    const fileUrl = await this.uploadFileToGcs(file, userId);
    timer.lap('gcsUploadMs');
    const fileRecord = await this.fileRepository.save(
      new FileEntity(uuid(), file.originalname, fileUrl, companyId, 'extractions', file.mimetype, {
        size: file.buffer.length,
        mimeType: file.mimetype,
        uploadedBy: userId,
      }),
    );
    const extraction = await this.fileExtractionRepository.create({
      batchId,
      category: resolved.category,
      fileName: file.originalname,
      fileIndex,
      fileId: fileRecord.id,
      companyId,
      userId,
    });
    timer.lap('dbInitMs');
    recordBatchPhaseTimings({
      extractionId: extraction.id,
      batchId,
      fileName: file.originalname,
      fileSizeBytes: file.buffer.length,
      category: resolved.category,
      outcome: 'success',
      phases: timer.toRecord(),
      totalMs: Date.now() - totalStart,
    });
    return extraction;
  }

  private async uploadFileToGcs(file: MulterFileInput, userId: string): Promise<string> {
    const multerLike = {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
    } as Express.Multer.File;
    return this.fileService.uploadFile(multerLike, userId, 'extractions', file.mimetype);
  }

  private runExtractionsInBackground(
    files: readonly MulterFileInput[],
    extractions: FileExtractionRecord[],
    userCategories: readonly BatchExtractionCategory[],
    companyId: string,
    batchId: string,
  ): void {
    const queue = getBatchExtractionQueue();
    const enqueueAll = extractions.map((extraction, i) =>
      queue.addJob({
        extractionId: extraction.id,
        batchId,
        fileIndex: extraction.fileIndex,
        fileName: extraction.fileName,
        mimeType: files[i].mimetype,
        companyId,
        userCategory: userCategories[i] ?? 'auto',
        fileUrl: extraction.fileUrl ?? undefined,
      }),
    );
    Promise.all(enqueueAll).catch((err) =>
      console.error('[BATCH-EXTRACTION] Failed to enqueue jobs:', err),
    );
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
    const extraction = await this.fileExtractionRepository.findById(args.extractionId);
    if (!extraction) {
      throw new Error(`FileExtraction ${args.extractionId} not found`);
    }
    const file: MulterFileInput = {
      buffer: args.fileBuffer,
      originalname: args.fileName,
      mimetype: args.mimeType,
    };
    const io = getGlobalSocketIO();
    const room = `extraction:${args.batchId}`;
    try {
      await this.processOneFile(
        file,
        extraction,
        args.userCategory === 'auto',
        args.companyId,
        io,
        room,
        args.batchId,
      );
    } finally {
      await this.maybeEmitBatchDone(args.batchId);
    }
  }

  private async maybeEmitBatchDone(batchId: string): Promise<void> {
    const records = await this.fileExtractionRepository.findByBatchId(batchId);
    const stillLoading = records.some((r) => r.status === 'LOADING');
    if (stillLoading) return;
    const io = getGlobalSocketIO();
    io?.to(`extraction:${batchId}`).emit('extraction:done', { batchId });
  }

  private async processOneFile(
    file: MulterFileInput,
    extraction: FileExtractionRecord,
    wasAutoDetected: boolean,
    companyId: string,
    io: SocketServer | null,
    room: string,
    batchId: string,
  ): Promise<void> {
    const totalStart = Date.now();
    const timer = new PhaseTimer();
    let finalCategory: ResolvedCategory = extraction.category as ResolvedCategory;
    try {
      const resolved = await this.resolveWithPdfText(
        file,
        extraction.category as ResolvedCategory,
        wasAutoDetected,
      );
      timer.lap('categoryResolveMs');
      finalCategory = resolved.category;
      if (finalCategory !== extraction.category) {
        await this.fileExtractionRepository.update(extraction.id, { category: finalCategory });
      }
      this.emitProgress(io, room, extraction, 10, batchId);
      await this.fileExtractionRepository.update(extraction.id, { progress: 10 });
      timer.lap('dbWriteMs');
      let progressUpdate = Promise.resolve();
      const data = await this.extractData(file, resolved, companyId, (progress) => {
        this.emitProgress(io, room, extraction, progress, batchId);
        progressUpdate = progressUpdate
          .then(() => this.fileExtractionRepository.update(extraction.id, { progress }))
          .then(() => undefined)
          .catch((error) => {
            console.warn('[BATCH-EXTRACTION] Failed to update progress:', error);
          });
      });
      await progressUpdate;
      timer.lap('extractionMs');
      assertUsefulExtraction(data, finalCategory);
      if (this.logEditUseCase && (finalCategory === 'invoice' || finalCategory === 'ddt')) {
        await this.logEditUseCase.execute({
          extractionId: extraction.id,
          source: 'LLM_INITIAL',
          before: null,
          after: data,
          userId: null,
        });
      }
      await this.fileExtractionRepository.update(extraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: data,
        category: finalCategory,
      });
      timer.lap('dbWriteMs');
      io?.to(room).emit('extraction:completed', {
        extractionId: extraction.id,
        batchId,
        fileIndex: extraction.fileIndex,
        fileName: extraction.fileName,
        category: finalCategory,
        status: 'PENDING_CONFIRMATION',
      });
      recordBatchPhaseTimings({
        extractionId: extraction.id,
        batchId,
        fileName: extraction.fileName,
        fileSizeBytes: file.buffer.length,
        category: finalCategory,
        outcome: 'success',
        phases: timer.toRecord(),
        totalMs: Date.now() - totalStart,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Extraction failed';
      await this.fileExtractionRepository.update(extraction.id, {
        status: 'ERROR',
        error: message,
      });
      timer.lap('dbWriteMs');
      io?.to(room).emit('extraction:error', {
        extractionId: extraction.id,
        batchId,
        fileIndex: extraction.fileIndex,
        fileName: extraction.fileName,
        error: message,
      });
      recordBatchPhaseTimings({
        extractionId: extraction.id,
        batchId,
        fileName: extraction.fileName,
        fileSizeBytes: file.buffer.length,
        category: finalCategory,
        outcome: 'error',
        phases: timer.toRecord(),
        totalMs: Date.now() - totalStart,
        error: message,
      });
    }
  }

  private async resolveWithPdfText(
    file: MulterFileInput,
    currentCategory: ResolvedCategory,
    wasAutoDetected: boolean,
  ): Promise<ResolvedFileCategory> {
    const fileFormat = resolveFileFormat(file.mimetype, file.originalname);
    const isPdf = fileFormat === 'pdf';
    if (!isPdf) {
      return { category: currentCategory, fileFormat, isAsync: false };
    }
    if (!wasAutoDetected) {
      return {
        category: currentCategory,
        fileFormat: 'pdf',
        isAsync:
          currentCategory === 'agricultural' ||
          currentCategory === 'fields' ||
          currentCategory === 'production_units',
      };
    }
    const { text } = await pdfToText(file.buffer);
    return resolveFileCategory({
      userCategory: 'auto',
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      pdfText: text,
    });
  }

  private emitProgress(
    io: SocketServer | null,
    room: string,
    extraction: FileExtractionRecord,
    progress: number,
    batchId: string,
  ): void {
    io?.to(room).emit('extraction:progress', {
      extractionId: extraction.id,
      batchId,
      fileIndex: extraction.fileIndex,
      fileName: extraction.fileName,
      progress,
    });
  }

  private async extractData(
    file: MulterFileInput,
    resolved: ResolvedFileCategory,
    companyId: string,
    onProgress: (progress: number) => void,
  ): Promise<ExtractionData> {
    switch (resolved.category) {
      case 'fields':
        onProgress(50);
        return this.extractFields(file, resolved.fileFormat, companyId);
      case 'production_units':
        return this.extractProductionUnits(file, resolved.fileFormat, companyId, onProgress);
      case 'agricultural':
        return this.extractAgricultural(file, resolved.fileFormat, companyId, onProgress);
      case 'invoice':
        return this.extractInvoice(file, onProgress, companyId);
      case 'ddt':
        return this.extractDdt(file, onProgress, companyId);
      case 'stock':
        return this.extractStock(file, onProgress);
    }
  }

  private async extractFields(
    file: MulterFileInput,
    fileFormat: string,
    companyId: string,
  ): Promise<FieldsExtractionData> {
    if (fileFormat === 'shapefile') {
      return this.extractFieldsFromShapefile(file.buffer, companyId, file.originalname);
    }
    if (fileFormat === 'geojson') {
      return this.extractFieldsFromGeojson(file.buffer, companyId);
    }
    const agent = new FieldCsvAgent();
    const result = await agent.extractFieldsFromCsv(file.buffer);
    return {
      fields: result.fields.map((f) => normalizeExtractedField(f, companyId)),
      extractedCount: result.fields.length,
      diagnostics: result.diagnostics,
    };
  }

  private async extractFieldsFromShapefile(
    buffer: Buffer,
    companyId: string,
    fileName: string,
  ): Promise<FieldsExtractionData> {
    const result = await parseShapefileUpload({ buffer, fileName, mimeType: 'application/zip' });
    return {
      fields: result.fields.map((f) => normalizeExtractedField(f, companyId)),
      extractedCount: result.fields.length,
      diagnostics: result.diagnostics,
    };
  }

  private async extractFieldsFromGeojson(
    buffer: Buffer,
    companyId: string,
  ): Promise<FieldsExtractionData> {
    const result = await parsePcgGeojson(buffer);
    return {
      fields: result.fields.map((f) => normalizeExtractedField(f, companyId)),
      extractedCount: result.fields.length,
      diagnostics: result.diagnostics,
    };
  }

  private async extractProductionUnits(
    file: MulterFileInput,
    fileFormat: string,
    companyId: string,
    onProgress: (progress: number) => void,
  ): Promise<ProductionUnitsExtractionData> {
    if (fileFormat === 'pdf') {
      const pdfAgent = new PianoColturalePdfAgent();
      const result = await pdfAgent.extractFromPdf(file.buffer, (completed, total) => {
        onProgress(10 + Math.round(((completed + 1) / total) * 80));
      });
      const previews = await this.buildPuPreviews(result.productionUnits.units, companyId);
      return {
        productionUnits: previews,
        extractedCount: previews.length,
        diagnostics: result.productionUnits.diagnostics,
      };
    }
    const csvAgent = new ProductionUnitCsvAgent();
    const result = await csvAgent.extractProductionUnitsFromCsv(file.buffer);
    onProgress(70);
    const previews = await this.buildPuPreviews(result.units, companyId);
    return {
      productionUnits: previews,
      extractedCount: previews.length,
      diagnostics: result.diagnostics,
    };
  }

  private async extractAgricultural(
    file: MulterFileInput,
    fileFormat: string,
    companyId: string,
    onProgress: (progress: number) => void,
  ): Promise<AgriculturalExtractionData> {
    if (fileFormat === 'pdf') {
      const pdfAgent = new PianoColturalePdfAgent();
      const result = await pdfAgent.extractFromPdf(file.buffer, (completed, total) => {
        onProgress(10 + Math.round(((completed + 1) / total) * 80));
      });
      const fields = result.fields.fields.map((f) => normalizeExtractedField(f, companyId));
      const productionUnits = await this.buildPuPreviews(result.productionUnits.units, companyId);
      return {
        fields,
        productionUnits,
        extractedCount: fields.length + productionUnits.length,
        diagnostics: result.fields.diagnostics,
      };
    }
    if (fileFormat === 'geojson') {
      onProgress(20);
      const geoResult = await parsePcgGeojson(file.buffer);
      onProgress(60);
      const fields = geoResult.fields.map((f) => normalizeExtractedField(f, companyId));
      const rawUnits = mapGeoShapeRowsToRawUnits(
        geoResult.fields,
        geoResult.productionUnits.map((pu) => ({
          name: pu.name,
          cropName: pu.cropName,
          cropType: pu.cropType,
          variety: pu.variety,
          protocoll: pu.protocoll,
          protectionStructure: pu.protectionStructure,
          startDate: pu.startDate,
          endDate: pu.endDate,
          areaHa: pu.areaHa,
          fieldIndex: pu.fieldIndex,
          destinazioneDiUso: pu.destinazioneDiUso,
        })),
      );
      const productionUnits = await this.buildPuPreviews(rawUnits, companyId);
      onProgress(90);
      return {
        fields,
        productionUnits,
        extractedCount: fields.length + productionUnits.length,
        diagnostics: geoResult.diagnostics,
      };
    }
    if (fileFormat === 'shapefile') {
      onProgress(20);
      if (isVenetoPcgZip(file.buffer)) {
        const venetoPcgResult = await parseVenetoPcgZip(file.buffer);
        onProgress(90);
        const fields = venetoPcgResult.fields.map((field) =>
          normalizeExtractedField(field, companyId),
        );
        return {
          fields,
          productionUnits: venetoPcgResult.productionUnits,
          extractedCount: fields.length + venetoPcgResult.productionUnits.length,
          diagnostics: venetoPcgResult.diagnostics,
        };
      }
      const shapeResult = await parseShapefileUploadOrZipTables(file);
      onProgress(60);
      const extractedFields =
        'fieldsResult' in shapeResult ? shapeResult.fieldsResult.fields : shapeResult.fields;
      const fields = extractedFields.map((field) => normalizeExtractedField(field, companyId));
      const rawUnits =
        'productionUnitResult' in shapeResult
          ? shapeResult.productionUnitResult.units
          : mapGeoShapeRowsToRawUnits(
              shapeResult.fields,
              shapeResult.productionUnits.map((pu) => ({
                name: pu.name,
                cropName: pu.cropName,
                cropType: pu.cropType,
                variety: pu.variety,
                protocoll: pu.protocoll,
                protectionStructure: pu.protectionStructure,
                startDate: pu.startDate,
                endDate: pu.endDate,
                areaHa: pu.areaHa,
                fieldIndex: pu.fieldIndex,
                destinazioneDiUso: pu.destinazioneDiUso,
              })),
            );
      const productionUnits = await this.buildPuPreviews(rawUnits, companyId);
      onProgress(90);
      return {
        fields,
        productionUnits,
        extractedCount: fields.length + productionUnits.length,
        diagnostics: shapeResult.diagnostics,
      };
    }
    const fieldAgent = new FieldCsvAgent();
    const fieldResult = await fieldAgent.extractFieldsFromCsv(file.buffer);
    onProgress(40);
    const puAgent = new ProductionUnitCsvAgent();
    const puResult = await puAgent.extractProductionUnitsFromCsv(file.buffer);
    onProgress(70);
    const fields = fieldResult.fields.map((f) => normalizeExtractedField(f, companyId));
    const productionUnits = await this.buildPuPreviews(puResult.units, companyId);
    return {
      fields,
      productionUnits,
      extractedCount: fields.length + productionUnits.length,
      diagnostics: fieldResult.diagnostics,
    };
  }

  private async extractInvoice(
    file: MulterFileInput,
    onProgress: (progress: number) => void,
    companyId: string,
  ): Promise<InvoiceExtractionData> {
    const companyKind = await this.resolveCompanyKind(companyId);
    const tmpPath = path.join(
      os.tmpdir(),
      `extraction-${uuid()}-${sanitizeTempFileName(file.originalname)}`,
    );
    let rawTextPath: string | null = null;
    try {
      await fsp.writeFile(tmpPath, new Uint8Array(file.buffer));
      onProgress(30);
      const service =
        this.dependencies.invoiceServiceFactory?.() ?? new ExtractDataFromInvoiceService();
      const result = await service.execute({ filePath: tmpPath, companyKind });
      rawTextPath = result.rawTextPath;
      onProgress(90);
      const enrichedEntries = enrichInvoiceEntriesWithConversions(result.entries);
      return { entries: enrichedEntries, extractedCount: enrichedEntries.length };
    } finally {
      await safeUnlink(tmpPath);
      if (rawTextPath && rawTextPath !== tmpPath) await safeUnlink(rawTextPath);
    }
  }

  private async extractDdt(
    file: MulterFileInput,
    onProgress: (progress: number) => void,
    companyId: string,
  ): Promise<DdtExtractionData> {
    const companyKind = await this.resolveCompanyKind(companyId);
    const tmpPath = path.join(
      os.tmpdir(),
      `extraction-${uuid()}-${sanitizeTempFileName(file.originalname)}`,
    );
    let rawTextPath: string | null = null;
    try {
      await fsp.writeFile(tmpPath, new Uint8Array(file.buffer));
      onProgress(30);
      const service = this.dependencies.ddtServiceFactory?.() ?? new ExtractDataFromDdtService();
      const result = await service.execute({ pdfPath: tmpPath, companyKind });
      rawTextPath = result.rawTextPath;
      onProgress(90);
      return { entries: result.entries, extractedCount: result.entries.length };
    } finally {
      await safeUnlink(tmpPath);
      if (rawTextPath && rawTextPath !== tmpPath) await safeUnlink(rawTextPath);
    }
  }

  private async extractStock(
    _file: MulterFileInput,
    onProgress: (progress: number) => void,
  ): Promise<StockExtractionData> {
    onProgress(50);
    return { entries: [], extractedCount: 0 };
  }

  private async resolveCompanyKind(companyId: string): Promise<CompanyKind> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { kind: true },
    });
    return company?.kind ?? CompanyKind.AGRICULTURAL;
  }

  private async buildPuPreviews(
    rawUnits: ProductionUnitRaw[],
    companyId: string,
  ): Promise<ProductionUnitPreview[]> {
    const companyFields = await this.fieldRepository.findManyByCompanyId(companyId);
    const fieldIdx = buildFieldIndex(companyFields);
    const cropCatalog = getCropCatalog();
    return rawUnits.map(
      (unit) =>
        buildProductionUnitPreview(
          unit,
          companyId,
          fieldIdx,
          cropCatalog,
        ) as unknown as ProductionUnitPreview,
    );
  }
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
  } catch {
    /* file already removed or inaccessible — nothing to do */
  }
}

function assertUsefulExtraction(data: ExtractionData, category: ResolvedCategory): void {
  if (data.extractedCount > 0) return;
  const fallbackCount = countExtractedItems(data);
  if (fallbackCount > 0) return;
  throw new Error(`No usable ${category} data extracted from file`);
}

function countExtractedItems(data: ExtractionData): number {
  if ('entries' in data && Array.isArray(data.entries)) {
    return data.entries.length;
  }
  if ('fields' in data && 'productionUnits' in data) {
    return data.fields.length + data.productionUnits.length;
  }
  if ('fields' in data && Array.isArray(data.fields)) {
    return data.fields.length;
  }
  if ('productionUnits' in data && Array.isArray(data.productionUnits)) {
    return data.productionUnits.length;
  }
  return 0;
}

function sanitizeTempFileName(fileName: string): string {
  const extension = path.extname(fileName).replace(/[^a-zA-Z0-9.]/g, '');
  const baseName = path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  return `${baseName || 'document'}${extension}`;
}

async function parseShapefileUploadOrZipTables(
  file: MulterFileInput,
): Promise<
  | Awaited<ReturnType<typeof parseShapefileUpload>>
  | Awaited<ReturnType<typeof extractAgriculturalZipTables>>
> {
  try {
    return await parseShapefileUpload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
  } catch (error) {
    if (!isZipUpload(file)) throw error;
    return extractAgriculturalZipTables(file.buffer);
  }
}

function isZipUpload(file: MulterFileInput): boolean {
  const lowerName = file.originalname.toLowerCase();
  return (
    lowerName.endsWith('.zip') ||
    file.mimetype === 'application/zip' ||
    file.mimetype === 'application/x-zip-compressed'
  );
}
