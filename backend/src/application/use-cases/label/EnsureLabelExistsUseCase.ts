import { Label, isFitoLabel, isUsableLabel } from '../../../domain/dtos/label.dto';
import { FertilizerLabel } from '../../../domain/dtos/fertilizer-label.dto';
import {
  ILabelExtractionRepository,
  LabelCategory,
  LabelExtractionRecord,
  SavedLabelExtraction,
} from '../../../domain/repositories/ILabelExtractionRepository';
import { ILabelExtractor, ILabelTextProvider } from '../../../domain/repositories/ILabelServices';
import { ExtractFertilizerLabelAdapter } from '../../../infrastructure/services/tool/extractFertilizerLabel.adapter';
import { LlmProductCategoryClassifier } from '../../../infrastructure/services/tool/llm-product-category-classifier';
import { findFertilizerLabelUrl } from '../../../infrastructure/services/tool/tavilyFertilizerLabelSearch';
import { extractMarkdownWithMistralOCRFromUrl } from '../../../infrastructure/services/ocr/mistral';
import { PrismaLabelExtractionRepository } from '../../../infrastructure/repositories/PrismaLabelExtractionRepository';
import { GetLabelTextProvider } from '../../../infrastructure/services/tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../../infrastructure/services/tool/extractLabel.adapter';
import { ExtractFertilizerLabelAdapter as FertAdapter } from '../../../infrastructure/services/tool/extractFertilizerLabel.adapter';
import { prisma } from '../../../infrastructure/repositories/Prisma';

export type EnsureLabelSource = 'db' | 'fito_extracted' | 'fertilizer_extracted' | 'none';

export interface EnsureLabelExistsInput {
  readonly productName: string;
  readonly registrationNumber: string;
}

export interface EnsureLabelExistsOutput {
  readonly source: EnsureLabelSource;
  readonly record: LabelExtractionRecord | null;
  readonly reason?: string;
}

const LOG = '[ENSURE-LABEL]';

/**
 * Ensures a `LabelExtraction` row exists for (productName, registrationNumber).
 * If missing in DB, classifies the product and extracts on-demand:
 *  - PHYTOSANITARY → SIAN PDF + LLM extractor (reuses existing FITO pipeline)
 *  - FERTILIZER    → Tavily search + LLM judge → Mistral OCR + fertilizer extractor
 *  - OTHER         → no-op, returns source: 'none'
 */
export class EnsureLabelExistsUseCase {
  constructor(
    private readonly repo: ILabelExtractionRepository,
    private readonly fitoTextProvider: ILabelTextProvider,
    private readonly fitoExtractor: ILabelExtractor,
    private readonly fertilizerExtractor: ExtractFertilizerLabelAdapter,
    private readonly classifier: LlmProductCategoryClassifier = new LlmProductCategoryClassifier(),
  ) {}

  public async execute(input: EnsureLabelExistsInput): Promise<EnsureLabelExistsOutput> {
    const productName = (input.productName ?? '').trim();
    const registrationNumber = (input.registrationNumber ?? '').trim();
    if (!productName) {
      return { source: 'none', record: null, reason: 'Missing product name' };
    }

    const existing = await this.findInDb(productName, registrationNumber);
    if (existing) {
      console.log(`${LOG} HIT db for "${productName}" (${registrationNumber || 'no-reg'})`);
      return { source: 'db', record: existing };
    }

    const category = await this.classifyCategory(productName);
    console.log(`${LOG} classified "${productName}" as ${category}`);

    if (category === 'PHYTOSANITARY') {
      return this.extractFito(productName, registrationNumber);
    }
    if (category === 'FERTILIZER') {
      return this.extractFertilizer(productName, registrationNumber);
    }
    return { source: 'none', record: null, reason: 'Product not classifiable as fito/fertilizer' };
  }

  private async findInDb(
    productName: string,
    registrationNumber: string,
  ): Promise<LabelExtractionRecord | null> {
    if (registrationNumber) {
      const exact = await this.repo.findByProductAndRegistration({
        productName,
        registrationNumber,
      });
      if (exact) return exact;
    }
    const search = await this.repo.searchByProductName({ productName, limit: 1 });
    return search[0] ?? null;
  }

  private async classifyCategory(productName: string): Promise<string> {
    const result = await this.classifier.classifyProductNames({ productNames: [productName] });
    return result.get(productName.trim().toUpperCase()) ?? 'OTHER';
  }

  private async extractFito(
    productName: string,
    registrationNumber: string,
  ): Promise<EnsureLabelExistsOutput> {
    console.log(`${LOG} FITO branch — fetching SIAN text for "${productName}"`);
    const textRes = await this.fitoTextProvider.getText(productName, registrationNumber);
    if (!textRes) {
      return { source: 'none', record: null, reason: 'SIAN text fetch failed' };
    }
    console.log(`${LOG} FITO branch — extracting label (${textRes.text.length} chars)`);
    const label: Label = await this.fitoExtractor.extract(textRes.text);
    if (!isFitoLabel(label) || !isUsableLabel(label)) {
      return { source: 'none', record: null, reason: 'FITO extraction returned empty label' };
    }
    const finalName = label.prodotto?.trim() || productName;
    const finalReg = label.numero_registrazione?.trim() || registrationNumber || 'NO-REG';
    const saved = await this.repo.saveExtraction({
      productName: finalName,
      registrationNumber: finalReg,
      sourceUrl: textRes.url ?? '',
      category: LabelCategory.FITO,
      label,
      rawText: textRes.text,
      extractionConfidence: label.extraction_confidence ?? 0,
      extractedFields: label.extracted_fields ?? [],
      errors: label.errors ?? [],
      qualityExtraction: [],
    } satisfies SavedLabelExtraction);
    console.log(`${LOG} FITO branch — saved "${finalName}" (${finalReg})`);
    return { source: 'fito_extracted', record: saved };
  }

  private async extractFertilizer(
    productName: string,
    registrationNumber: string,
  ): Promise<EnsureLabelExistsOutput> {
    console.log(`${LOG} FERT branch — Tavily search for "${productName}"`);
    const lookup = await findFertilizerLabelUrl(productName);
    if (!lookup) {
      return { source: 'none', record: null, reason: 'No fertilizer label found via Tavily' };
    }
    console.log(
      `${LOG} FERT branch — picked ${lookup.url} (confidence=${lookup.confidence}) — running OCR`,
    );
    let text: string;
    try {
      text = (await extractMarkdownWithMistralOCRFromUrl(lookup.url)).trim();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown OCR error';
      return { source: 'none', record: null, reason: `OCR failed: ${reason}` };
    }
    if (text.length < 50) {
      return { source: 'none', record: null, reason: 'OCR returned too little text' };
    }
    console.log(`${LOG} FERT branch — extracting fertilizer label (${text.length} chars)`);
    const label: FertilizerLabel = await this.fertilizerExtractor.extract(text);
    const commercialName =
      label.prodotto_fertilizzante_ue?.identificazione_prodotto?.nome_commerciale?.trim() ||
      productName;
    const lotNumber =
      label.prodotto_fertilizzante_ue?.identificazione_prodotto?.numero_lotto?.trim() ||
      registrationNumber ||
      `FERT-${Date.now()}`;
    const saved = await this.repo.saveExtraction({
      productName: commercialName,
      registrationNumber: lotNumber,
      sourceUrl: lookup.url,
      category: LabelCategory.FERTILIZER,
      label,
      rawText: text,
      extractionConfidence: 0,
      extractedFields: [],
      errors: [],
      qualityExtraction: [],
    } satisfies SavedLabelExtraction);
    console.log(`${LOG} FERT branch — saved "${commercialName}"`);
    return { source: 'fertilizer_extracted', record: saved };
  }
}

/**
 * Factory using the standard production wiring (Prisma repo, SIAN text provider,
 * Mistral OCR for fertilizers, default LLM classifier).
 */
export function createEnsureLabelExistsUseCase(): EnsureLabelExistsUseCase {
  return new EnsureLabelExistsUseCase(
    new PrismaLabelExtractionRepository(prisma),
    new GetLabelTextProvider(),
    new ExtractLabelAdapter(),
    new FertAdapter(),
  );
}
