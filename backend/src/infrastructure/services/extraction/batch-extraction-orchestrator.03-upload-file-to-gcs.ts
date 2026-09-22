import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorUploadFileToGcs(this: BatchExtractionOrchestratorContext, file: MulterFileInput, userId: string): Promise<string> {
    const multerLike = {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
    } as Express.Multer.File;
    return this.fileService.uploadFile(multerLike, userId, 'extractions', file.mimetype);
  }
