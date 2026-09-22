import {
  Label,
  LabelWithQuality,
  isFitoLabel,
  isUsableLabel,
} from '../../../domain/dtos/label.dto';
import {
  ILabelExtractionRepository,
  LabelCategory,
  LabelExtractionRecord,
  SavedLabelExtraction,
} from '../../../domain/repositories/ILabelExtractionRepository';
import { ILabelExtractor, ILabelTextProvider } from '../../../domain/repositories/ILabelServices';
import { DosageAgentContext } from '../../../infrastructure/services/agents/dosage_agent/context';

export interface BulkExtractFromPdfFilesItemInput {
  readonly fileName: string;
  readonly pdfBuffer: Buffer;
}

export interface BulkExtractLabelsFromPdfFilesInput {
  readonly files: ReadonlyArray<BulkExtractFromPdfFilesItemInput>;
  readonly userId: string;
  readonly concurrency?: number;
  readonly callbacks?: ReadonlyArray<unknown>;
  readonly usageAccumulator?: { addMistralOcrPage: () => void };
  readonly context?: DosageAgentContext;
}

export interface BulkExtractFromPdfFilesItemResult {
  readonly fileName: string;
  readonly status: 'extracted' | 'failed';
  readonly name?: string;
  readonly regNumber?: string;
  readonly bucketUrl?: string;
  readonly label?: Label;
  readonly record?: LabelExtractionRecord;
  readonly error?: string;
}

export interface BulkExtractLabelsFromPdfFilesOutput {
  readonly results: ReadonlyArray<BulkExtractFromPdfFilesItemResult>;
}

export interface IFileUploadService {
  uploadPdfToStorage(buffer: Buffer, fileName: string, userId: string): Promise<string>;
}

/**
 * Orchestrates bulk label extraction from uploaded PDF files.
 * - Uploads each PDF to GCS bucket
 * - Extracts text from PDF
 * - Extracts name and regNumber from text using LLM
 * - Extracts structured label data
 * - Saves to database with bucket URL as sourceUrl
 */
export class BulkExtractLabelsFromPdfFilesUseCase {
  constructor(
    private readonly repo: ILabelExtractionRepository,
    private readonly textProvider: ILabelTextProvider,
    private readonly extractor: ILabelExtractor,
    private readonly fileService: IFileUploadService,
  ) {}

  public async execute(
    input: BulkExtractLabelsFromPdfFilesInput,
  ): Promise<BulkExtractLabelsFromPdfFilesOutput> {
    const safeFiles: ReadonlyArray<BulkExtractFromPdfFilesItemInput> = Array.from(
      input.files || [],
    );
    const maxConcurrency: number = Math.max(1, Math.min(10, input.concurrency ?? 5));
    const results: BulkExtractFromPdfFilesItemResult[] = [];
    const callbacks = Array.isArray(input.callbacks)
      ? (input.callbacks as ReadonlyArray<unknown>)
      : undefined;

    if (safeFiles.length === 0) {
      return { results };
    }

    // Set context on extractor/text provider if supported
    if (
      input.context &&
      'setContext' in this.extractor &&
      typeof this.extractor.setContext === 'function'
    ) {
      (this.extractor as { setContext: (context?: DosageAgentContext) => void }).setContext(
        input.context,
      );
    }
    if (
      input.context &&
      'setContext' in this.textProvider &&
      typeof this.textProvider.setContext === 'function'
    ) {
      (this.textProvider as { setContext: (context?: DosageAgentContext) => void }).setContext(
        input.context,
      );
    }

    let index = 0;
    const workers: Array<Promise<void>> = [];
    const usageAccumulator = input.usageAccumulator;
    for (let w = 0; w < maxConcurrency; w++) {
      workers.push(
        (async () => {
          while (true) {
            const current = this.getNext(safeFiles, () => index++);
            if (!current) break;
            const outcome = await this.extractAndPersist(
              current,
              input.userId,
              callbacks,
              usageAccumulator,
            );
            results.push(outcome);
          }
        })(),
      );
    }
    await Promise.all(workers);
    return { results };
  }

  private getNext(
    items: ReadonlyArray<BulkExtractFromPdfFilesItemInput>,
    advance: () => number,
  ): BulkExtractFromPdfFilesItemInput | null {
    const i = advance();
    if (i >= items.length) return null;
    return items[i];
  }

  private async extractAndPersist(
    item: BulkExtractFromPdfFilesItemInput,
    userId: string,
    callbacks?: ReadonlyArray<unknown>,
    usageAccumulator?: { addMistralOcrPage: () => void },
  ): Promise<BulkExtractFromPdfFilesItemResult> {
    const { fileName, pdfBuffer } = item;
    try {
      console.log(`[BULK_PDF_FILES] Processing ${fileName}`);
      const bucketUrl = await this.fileService.uploadPdfToStorage(pdfBuffer, fileName, userId);
      console.log(`[BULK_PDF_FILES] Uploaded to ${bucketUrl}`);
      const textRes = await this.textProvider.getText(bucketUrl, '');
      if (!textRes) {
        return {
          fileName,
          status: 'failed',
          bucketUrl,
          error: 'PDF text extraction failed',
        };
      }
      console.log(`[BULK_PDF_FILES] Extracted text (${textRes.text.length} chars)`);
      if (textRes.usedMistralOcr && usageAccumulator) {
        usageAccumulator.addMistralOcrPage();
      }
      const label: Label = await this.extractor.extract(textRes.text, callbacks);
      if (!isUsableLabel(label)) {
        console.warn(
          `[BULK_PDF_FILES] Extraction returned empty/unusable label for ${fileName} - NOT saving`,
        );
        return {
          fileName,
          status: 'failed',
          bucketUrl,
          error: 'Extraction returned empty label (0 dosaggi, 0 colture, confidence <= 10)',
        };
      }
      const name = label.prodotto?.trim();
      const regNumber = label.numero_registrazione?.trim();
      if (!name || !regNumber) {
        console.warn(
          `[BULK_PDF_FILES] Missing product name or registration for ${fileName} - NOT saving`,
        );
        return {
          fileName,
          status: 'failed',
          bucketUrl,
          label,
          error: 'Extraction did not produce product name and registration number',
        };
      }
      console.log(`[BULK_PDF_FILES] Extracted name="${name}" regNumber="${regNumber}"`);
      const existing = await this.repo.findByProductAndRegistration({
        productName: name,
        registrationNumber: regNumber,
      });
      if (existing && isFitoLabel(existing.label)) {
        console.log(`[BULK_PDF_FILES] Found existing record, reusing`);
        return {
          fileName,
          status: 'extracted',
          name,
          regNumber,
          bucketUrl,
          label: existing.label,
          record: existing,
        };
      }
      const saveInput: SavedLabelExtraction = {
        productName: name,
        registrationNumber: regNumber,
        sourceUrl: bucketUrl,
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
      console.log(`[BULK_PDF_FILES] Saved new extraction record`);
      return {
        fileName,
        status: 'extracted',
        name,
        regNumber,
        bucketUrl,
        label: saved.label as Label,
        record: saved,
      };
    } catch (err) {
      const message: string = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[BULK_PDF_FILES] Error processing ${fileName}:`, message);
      return { fileName, status: 'failed', error: message };
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
}
