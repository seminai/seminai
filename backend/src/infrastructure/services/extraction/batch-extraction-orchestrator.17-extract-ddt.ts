import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import { type DdtExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { ExtractDataFromDdtService } from '../tool/extractDataFromDDT';
import { MulterFileInput, safeUnlink, sanitizeTempFileName } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractDdt(this: BatchExtractionOrchestratorContext, file: MulterFileInput, onProgress: (progress: number) => void, companyId: string): Promise<DdtExtractionData> {
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
