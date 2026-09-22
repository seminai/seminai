import { FileExtractionResponse } from '../../../domain/dtos/file-extraction.dto';
import { FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';

export const toFileExtractionResponse = (
  record: FileExtractionRecord,
): FileExtractionResponse => ({
  id: record.id,
  batchId: record.batchId,
  companyId: record.companyId,
  status: record.status,
  category: record.category as FileExtractionResponse['category'],
  progress: record.progress,
  fileName: record.fileName,
  fileIndex: record.fileIndex,
  fileId: record.fileId,
  fileUrl: record.fileUrl,
  extractedData: record.extractedData,
  error: record.error,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});
