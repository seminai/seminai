import { type BatchExtractionCategory } from '../../../domain/dtos/file-extraction.dto';
import { getGlobalSocketIO } from '../agents/dosage_agent_react/socket/chat-socket-emitter';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorProcessQueuedFile(this: BatchExtractionOrchestratorContext, args: {
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
