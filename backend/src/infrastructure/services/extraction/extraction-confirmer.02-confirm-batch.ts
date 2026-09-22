import { ConfirmResult } from './extraction-confirmer.support';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerConfirmBatch(this: ExtractionConfirmerContext, batchId: string): Promise<{
    confirmed: ConfirmResult[];
    skipped: number;
    errors: Array<{ extractionId: string; error: string }>;
  }> {
    const extractions = await this.fileExtractionRepository.findByBatchId(batchId);
    const pending = extractions.filter((e) => e.status === 'PENDING_CONFIRMATION');
    const skipped = extractions.length - pending.length;
    const confirmed: ConfirmResult[] = [];
    const errors: Array<{ extractionId: string; error: string }> = [];
    for (const extraction of pending) {
      try {
        const result = await this.confirm(extraction.id);
        confirmed.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Confirmation failed';
        errors.push({ extractionId: extraction.id, error: message });
      }
    }
    return { confirmed, skipped, errors };
  }
