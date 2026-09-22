import { type Server as SocketServer } from 'socket.io';
import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export function batchExtractionOrchestratorEmitProgress(this: BatchExtractionOrchestratorContext, io: SocketServer | null, room: string, extraction: FileExtractionRecord, progress: number, batchId: string): void {
    io?.to(room).emit('extraction:progress', {
      extractionId: extraction.id,
      batchId,
      fileIndex: extraction.fileIndex,
      fileName: extraction.fileName,
      progress,
    });
  }
