import { extractTextFromImageWithGptVision } from '../ocr/gptVision';
import { extractStructuredFertilizerData } from './extractDataFromFertilizerLabel';
import { type FertilizerLabel } from '../../../domain/dtos/fertilizer-label.dto';

export interface ProductLabelImageExtractionResult {
  readonly label: FertilizerLabel;
  readonly rawText: string;
  readonly productName: string | null;
}

/**
 * Extracts structured product data from product label images (JPEG, PNG)
 * using GPT Vision for OCR and LLM-based structured extraction.
 */
export class ExtractProductLabelFromImageService {
  async execute(params: { imagePath: string }): Promise<ProductLabelImageExtractionResult> {
    console.log(`[LABEL_IMAGE_EXTRACTION] Starting extraction for: ${params.imagePath}`);
    const startTime = Date.now();

    const visionResult = await extractTextFromImageWithGptVision(params.imagePath);

    if (!visionResult.rawText || visionResult.rawText.length === 0) {
      throw new Error(
        'Failed to extract text from product label image. The image might be unreadable.',
      );
    }

    console.log(
      `[LABEL_IMAGE_EXTRACTION] Extracted ${visionResult.rawText.length} chars, running structured extraction...`,
    );

    const label = await extractStructuredFertilizerData(visionResult.rawText);

    const productName =
      label.prodotto_fertilizzante_ue?.identificazione_prodotto?.nome_commerciale ?? null;

    const elapsed = Date.now() - startTime;
    console.log(
      `[LABEL_IMAGE_EXTRACTION] Completed in ${elapsed}ms. Product: ${productName ?? 'unknown'}`,
    );

    return { label, rawText: visionResult.rawText, productName };
  }
}
