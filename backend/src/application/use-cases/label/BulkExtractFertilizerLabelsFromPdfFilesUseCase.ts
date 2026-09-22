import { FertilizerLabel } from '../../../domain/dtos/fertilizer-label.dto';
import {
  ILabelExtractionRepository,
  LabelCategory,
  SavedLabelExtraction,
} from '../../../domain/repositories/ILabelExtractionRepository';
import { ILabelTextProvider } from '../../../domain/repositories/ILabelServices';
import { ExtractFertilizerLabelAdapter } from '../../../infrastructure/services/tool/extractFertilizerLabel.adapter';
import { IFileUploadService } from './BulkExtractLabelsFromPdfFilesUseCase';
import { DosageAgentContext } from '../../../infrastructure/services/agents/dosage_agent/context';

const MIN_USABLE_FERTILIZER_CONFIDENCE = 20;

export interface BulkExtractFertilizerFromPdfFilesInput {
  readonly files: ReadonlyArray<{ fileName: string; pdfBuffer: Buffer }>;
  readonly userId: string;
  readonly concurrency?: number;
  readonly callbacks?: ReadonlyArray<unknown>;
  readonly usageAccumulator?: { addMistralOcrPage: () => void };
  readonly context?: DosageAgentContext;
}

export interface BulkExtractFertilizerFromPdfFilesOutput {
  readonly results: ReadonlyArray<{
    readonly fileName: string;
    readonly status: 'extracted' | 'failed';
    readonly bucketUrl?: string;
    readonly label?: FertilizerLabel;
    readonly error?: string;
  }>;
}

export class BulkExtractFertilizerLabelsFromPdfFilesUseCase {
  constructor(
    private readonly repo: ILabelExtractionRepository,
    private readonly textProvider: ILabelTextProvider,
    private readonly extractor: ExtractFertilizerLabelAdapter,
    private readonly fileService: IFileUploadService,
  ) {}

  public async execute(
    input: BulkExtractFertilizerFromPdfFilesInput,
  ): Promise<BulkExtractFertilizerFromPdfFilesOutput> {
    const files = input.files || [];
    const maxConcurrency = Math.max(1, Math.min(10, input.concurrency ?? 5));
    const results: Array<BulkExtractFertilizerFromPdfFilesOutput['results'][number]> = [];

    if (files.length === 0) {
      return { results };
    }

    let index = 0;
    const workers: Array<Promise<void>> = [];
    const usageAccumulator = input.usageAccumulator;

    for (let w = 0; w < maxConcurrency; w++) {
      workers.push(
        (async () => {
          while (true) {
            const current = this.getNext(files, () => index++);
            if (!current) break;
            const outcome = await this.extractAndPersist(
              current,
              input.userId,
              input.callbacks,
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

  private getNext<T>(items: ReadonlyArray<T>, advance: () => number): T | null {
    const i = advance();
    if (i >= items.length) return null;
    return items[i];
  }

  private async extractAndPersist(
    file: { fileName: string; pdfBuffer: Buffer },
    userId: string,
    callbacks?: ReadonlyArray<unknown>,
    usageAccumulator?: { addMistralOcrPage: () => void },
  ): Promise<BulkExtractFertilizerFromPdfFilesOutput['results'][number]> {
    try {
      const bucketUrl = await this.fileService.uploadPdfToStorage(
        file.pdfBuffer,
        file.fileName,
        userId,
      );
      const textRes = await this.textProvider.getText(bucketUrl, '');
      if (!textRes) {
        return {
          fileName: file.fileName,
          status: 'failed',
          bucketUrl,
          error: 'PDF text extraction failed',
        };
      }
      if (textRes.usedMistralOcr && usageAccumulator) {
        usageAccumulator.addMistralOcrPage();
      }
      // Cast callbacks to the type expected by the adapter
      const adapterCallbacks = callbacks as any;
      const label = await this.extractor.extract(textRes.text, adapterCallbacks);

      const name =
        label.prodotto_fertilizzante_ue?.identificazione_prodotto?.nome_commerciale?.trim() || null;
      const regNumber =
        label.prodotto_fertilizzante_ue?.identificazione_prodotto?.numero_lotto ||
        `NO-LOT-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const { confidence, extractedFields } = this.calculateConfidenceAndFields(label);
      if (!name || confidence < MIN_USABLE_FERTILIZER_CONFIDENCE) {
        return {
          fileName: file.fileName,
          status: 'failed',
          bucketUrl,
          label,
          error: `Extraction returned unusable fertilizer label (confidence ${confidence}, missing commercial name: ${!name})`,
        };
      }

      const saveInput: SavedLabelExtraction = {
        productName: name,
        registrationNumber: regNumber,
        sourceUrl: bucketUrl,
        category: LabelCategory.FERTILIZER,
        label,
        rawText: textRes.text,
        extractionConfidence: confidence,
        extractedFields: extractedFields,
        errors: [],
        qualityExtraction: [],
      };
      await this.repo.saveExtraction(saveInput);

      return {
        fileName: file.fileName,
        status: 'extracted',
        bucketUrl,
        label,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { fileName: file.fileName, status: 'failed', error: message };
    }
  }

  private calculateConfidenceAndFields(label: FertilizerLabel): {
    confidence: number;
    extractedFields: string[];
  } {
    let score = 0;
    const fields: string[] = [];

    const product = label.prodotto_fertilizzante_ue;
    if (!product) {
      return { confidence: 0, extractedFields: [] };
    }

    // 1. Identificazione (20 pts)
    if (product.identificazione_prodotto?.nome_commerciale) {
      score += 10;
      fields.push('nome_commerciale');
    }
    if (product.identificazione_prodotto?.funzione_categoria_prodotto) {
      score += 10;
      fields.push('funzione_categoria_prodotto');
    }

    // 2. Composizione (20 pts)
    if (product.composizione_garantita) {
      const comp = product.composizione_garantita;
      let hasCompData = false;
      if (
        comp.analisi_principale_NPK_percentuale_peso &&
        (comp.analisi_principale_NPK_percentuale_peso.N_totale !== null ||
          comp.analisi_principale_NPK_percentuale_peso.P2O5_totale !== null ||
          comp.analisi_principale_NPK_percentuale_peso.K2O_totale !== null)
      ) {
        hasCompData = true;
      }
      if (comp.forme_azoto?.length > 0) hasCompData = true;
      if (comp.micronutrienti?.length > 0) hasCompData = true;

      if (hasCompData) {
        score += 20;
        fields.push('composizione_garantita');
      }
    }

    // 3. Istruzioni Agronomiche (40 pts)
    if (product.istruzioni_uso_agronomiche) {
      const instr = product.istruzioni_uso_agronomiche;
      if (instr.uso_previsto) {
        score += 10;
        fields.push('uso_previsto');
      }

      if (instr.dosi_applicazione) {
        if (instr.dosi_applicazione.generale_kg_per_ettaro !== null) {
          score += 10;
          fields.push('dose_generale');
        }
        if (instr.dosi_applicazione.specifiche_coltura?.length > 0) {
          score += 20;
          fields.push('dosi_specifiche_coltura');
        }
      }
    }

    // 4. Sicurezza (20 pts)
    if (product.informazioni_sicurezza_clp) {
      const sec = product.informazioni_sicurezza_clp;
      let hasSec = false;
      if (sec.avvertenza) hasSec = true;
      if (sec.pittogrammi_pericolo?.length > 0) hasSec = true;
      if (sec.indicazioni_pericolo_H?.length > 0) hasSec = true;

      if (hasSec) {
        score += 20;
        fields.push('informazioni_sicurezza');
      }
    }

    return { confidence: Math.min(100, score), extractedFields: fields };
  }
}
