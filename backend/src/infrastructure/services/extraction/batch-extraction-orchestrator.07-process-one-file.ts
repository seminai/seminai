import { type Server as SocketServer } from 'socket.io';
import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { PhaseTimer } from './phase-timer';
import { recordBatchPhaseTimings } from './extraction-telemetry';
import { MulterFileInput, assertUsefulExtraction } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorProcessOneFile(this: BatchExtractionOrchestratorContext, file: MulterFileInput, extraction: FileExtractionRecord, wasAutoDetected: boolean, companyId: string, io: SocketServer | null, room: string, batchId: string): Promise<void> {
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
