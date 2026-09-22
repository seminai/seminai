import { v4 as uuid } from 'uuid';
import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { File as FileEntity } from '../../../domain/entities/File';
import { type BatchExtractionCategory } from '../../../domain/dtos/file-extraction.dto';
import { resolveFileCategory } from './file-category-resolver';
import { PhaseTimer } from './phase-timer';
import { recordBatchPhaseTimings } from './extraction-telemetry';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorPrepareSingleExtraction(this: BatchExtractionOrchestratorContext, args: {
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
