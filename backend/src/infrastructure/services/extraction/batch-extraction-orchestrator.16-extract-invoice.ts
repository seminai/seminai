import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { v4 as uuid } from 'uuid';
import { type InvoiceExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { ExtractDataFromInvoiceService } from '../tool/extractDataFromInvoice';
import { enrichInvoiceEntriesWithConversions } from './enrich-invoice-entries-with-conversions';
import { MulterFileInput, safeUnlink, sanitizeTempFileName } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractInvoice(this: BatchExtractionOrchestratorContext, file: MulterFileInput, onProgress: (progress: number) => void, companyId: string): Promise<InvoiceExtractionData> {
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
