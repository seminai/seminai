import {
  Label,
  LabelWithQuality,
  isFitoLabel,
  isUsableLabel,
} from '../../../domain/dtos/label.dto';
import { LabelExtractionError } from '../../../domain/errors/LabelExtractionError';
import { SianFetchError } from '../../../infrastructure/services/scraper/sian-errors';
import {
  FindLabelExtractionInput,
  ILabelExtractionRepository,
  LabelCategory,
  LabelExtractionRecord,
  SavedLabelExtraction,
} from '../../../domain/repositories/ILabelExtractionRepository';
import { ILabelExtractor, ILabelTextProvider } from '../../../domain/repositories/ILabelServices';

export interface BulkExtractItemInput {
  readonly name: string;
  readonly regNumber: string;
}

import { DosageAgentContext } from '../../../infrastructure/services/agents/dosage_agent/context';
import { normalizeLabelRegistrationNumber } from '../../../domain/utils/labelNormalization';

export interface BulkExtractLabelsInput {
  readonly items: ReadonlyArray<BulkExtractItemInput>;
  readonly userId?: string; // used by scraper uploader; provider may ignore
  readonly concurrency?: number; // default small to avoid SIAN rate limits
  readonly callbacks?: ReadonlyArray<unknown>; // optional LLM callbacks, passed to extractor
  readonly usageAccumulator?: { addMistralOcrPage: () => void }; // optional usage accumulator for Mistral OCR pages
  readonly context?: DosageAgentContext; // optional context for Socket.IO logging
}

export interface BulkExtractItemResult {
  readonly name: string;
  readonly regNumber: string;
  readonly status: 'cached' | 'extracted' | 'skipped' | 'failed';
  readonly url?: string;
  readonly label?: Label;
  readonly record?: LabelExtractionRecord;
  readonly error?: string;
}

export interface BulkExtractLabelsOutput {
  readonly results: ReadonlyArray<BulkExtractItemResult>;
}

/**
 * Orchestrates bulk label extraction using repository cache and SIAN provider/extractor.
 * - For each item: check cache by (productName, registrationNumber).
 * - If present: return cached.
 * - If absent: fetch text via provider, extract structured label, persist and return.
 * - Concurrency limited to avoid overwhelming remote endpoints.
 */
export class BulkExtractLabelsUseCase {
  constructor(
    private readonly repo: ILabelExtractionRepository,
    private readonly textProvider: ILabelTextProvider,
    private readonly extractor: ILabelExtractor,
  ) {}

  public async execute(input: BulkExtractLabelsInput): Promise<BulkExtractLabelsOutput> {
    const safeItems: ReadonlyArray<BulkExtractItemInput> = Array.from(input.items || []).map(
      (x) => ({ name: x.name.trim(), regNumber: x.regNumber.trim() }),
    );
    const maxConcurrency: number = Math.max(1, Math.min(10, input.concurrency ?? 10));
    const batchSize: number = 10;
    const results: BulkExtractItemResult[] = [];
    const callbacks = Array.isArray(input.callbacks)
      ? (input.callbacks as ReadonlyArray<unknown>)
      : undefined;

    // Set context on extractor if it supports it (ExtractLabelAdapter)
    if (
      input.context &&
      'setContext' in this.extractor &&
      typeof this.extractor.setContext === 'function'
    ) {
      (this.extractor as { setContext: (context?: DosageAgentContext) => void }).setContext(
        input.context,
      );
    }

    // Set context on text provider if it supports it (GetLabelTextProvider)
    if (
      input.context &&
      'setContext' in this.textProvider &&
      typeof this.textProvider.setContext === 'function'
    ) {
      (this.textProvider as { setContext: (context?: DosageAgentContext) => void }).setContext(
        input.context,
      );
    }

    // Handle invalid inputs upfront to avoid useless DB calls
    const candidates: BulkExtractItemInput[] = [];
    for (const it of safeItems) {
      if (!it.name || !it.regNumber) {
        results.push({
          name: it.name,
          regNumber: it.regNumber,
          status: 'skipped',
          error: 'Missing name or regNumber',
        });
        continue;
      }
      candidates.push(it);
    }

    // 1) Bulk lookup in Prisma in batches of 10
    const missing: BulkExtractItemInput[] = [];
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const params: ReadonlyArray<FindLabelExtractionInput> = batch.map((b) => ({
        productName: b.name,
        registrationNumber: b.regNumber,
      }));
      console.log(
        `[LABEL-CACHE] Searching database for ${batch.length} items:`,
        batch.map((b) => `${b.name} (${b.regNumber})`).join(', '),
      );
      const foundList = await this.repo.findManyByProductAndRegistration(params);
      console.log(
        `[LABEL-CACHE] Found ${foundList.length} cached labels:`,
        foundList.map((r) => `${r.productName} (${r.registrationNumber})`).join(', '),
      );
      for (const b of batch) {
        const record = this.findCachedRecord(b, foundList);
        if (record && isFitoLabel(record.label) && isUsableLabel(record.label)) {
          console.log(`[LABEL-CACHE] ✓ Found cached: ${b.name} (${b.regNumber})`);
          results.push({
            name: record.productName,
            regNumber: record.registrationNumber,
            status: 'cached',
            url: record.sourceUrl,
            label: record.label,
            record,
          });
        } else {
          const reason = record
            ? 'empty/unusable label in cache - will re-extract'
            : 'not found in cache - will fetch from SIAN';
          console.log(`[LABEL-CACHE] ✗ ${b.name} (${b.regNumber}): ${reason}`);
          missing.push(b);
        }
      }
    }

    if (missing.length === 0) {
      return { results };
    }

    // 2) Extract concurrently only the missing items
    let index = 0;
    const workers: Array<Promise<void>> = [];
    const usageAccumulator = input.usageAccumulator;
    for (let w = 0; w < maxConcurrency; w++) {
      workers.push(
        (async () => {
          while (true) {
            const current = this.getNext(missing, () => index++);
            if (!current) break;
            const outcome = await this.extractAndPersist(current, callbacks, usageAccumulator);
            results.push(outcome);
          }
        })(),
      );
    }
    await Promise.all(workers);
    return { results };
  }

  private getNext(
    items: ReadonlyArray<BulkExtractItemInput>,
    advance: () => number,
  ): BulkExtractItemInput | null {
    const i = advance();
    if (i >= items.length) return null;
    return items[i];
  }

  private async extractAndPersist(
    item: BulkExtractItemInput,
    callbacks?: ReadonlyArray<unknown>,
    usageAccumulator?: { addMistralOcrPage: () => void },
  ): Promise<BulkExtractItemResult> {
    const { name, regNumber } = item;
    try {
      const textRes = await this.textProvider.getText(name, regNumber);
      if (!textRes) {
        return { name, regNumber, status: 'failed', error: 'Label text not available' };
      }
      if (textRes.usedMistralOcr && usageAccumulator) {
        usageAccumulator.addMistralOcrPage();
      }
      const label: Label = await this.extractor.extract(textRes.text, callbacks);
      if (!isUsableLabel(label)) {
        console.warn(
          `[LABEL-EXTRACT] ⚠ Extraction returned empty/unusable label for ${name} (${regNumber}) - NOT saving to cache`,
        );
        return {
          name,
          regNumber,
          status: 'failed',
          error: 'Extraction returned empty label (0 dosaggi, 0 colture, confidence 0)',
        };
      }
      const saveInput: SavedLabelExtraction = {
        productName: name,
        registrationNumber: regNumber,
        sourceUrl: textRes.url,
        sourcePdfHash: textRes.sourcePdfHash ?? null,
        rawTextHash: textRes.rawTextHash ?? null,
        officialSourceUrl: textRes.officialSourceUrl ?? null,
        category: LabelCategory.FITO,
        label,
        rawText: textRes.text,
        extractionConfidence: label.extraction_confidence ?? 0,
        extractedFields: label.extracted_fields ?? [],
        errors: label.errors ?? [],
        qualityExtraction: this.pickQualityExtraction(label),
      };
      const saved = await this.repo.saveExtraction(saveInput);
      return {
        name,
        regNumber,
        status: 'extracted',
        url: saved.sourceUrl,
        label: saved.label as Label,
        record: saved,
      };
    } catch (err) {
      if (err instanceof SianFetchError) {
        console.warn(
          `[LABEL-EXTRACT] SIAN ${err.reason} for ${name} (${regNumber}): ${err.message}`,
        );
        return { name, regNumber, status: 'failed', error: `sian_${err.reason}` };
      }
      if (err instanceof LabelExtractionError) {
        console.error(
          `[LABEL-EXTRACT] ✗ Extraction failed for ${name} (${regNumber}): ${err.message} - NOT saving to cache`,
        );
        return { name, regNumber, status: 'failed', error: err.message };
      }
      const message: string = err instanceof Error ? err.message : 'Unknown error';
      return { name, regNumber, status: 'failed', error: message };
    }
  }

  private isLabelWithQuality(value: unknown): value is LabelWithQuality {
    if (value === null || typeof value !== 'object') return false;
    const maybe = value as Partial<LabelWithQuality>;
    return Array.isArray(maybe.qualityExtraction);
  }

  private pickQualityExtraction(label: Label | LabelWithQuality): number[] {
    return this.isLabelWithQuality(label) ? (label.qualityExtraction as number[]) : [];
  }

  private findCachedRecord(
    item: BulkExtractItemInput,
    records: ReadonlyArray<LabelExtractionRecord>,
  ): LabelExtractionRecord | null {
    const requestedReg = normalizeLabelRegistrationNumber(item.regNumber);
    const requestedName = item.name.trim().toLowerCase();
    return (
      records.find((record) => {
        const recordReg = record.normalizedRegistrationNumber;
        if (requestedReg && recordReg === requestedReg) return true;
        return (
          record.productName.trim().toLowerCase() === requestedName &&
          record.registrationNumber.trim().toLowerCase() === item.regNumber.trim().toLowerCase()
        );
      }) ?? null
    );
  }
}
