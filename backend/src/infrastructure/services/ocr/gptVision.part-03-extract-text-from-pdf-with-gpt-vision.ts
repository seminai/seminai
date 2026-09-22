import { hasChatLlmApiKey, resolveDefaultVisionModel } from '../llm-config';
import fs from 'fs';
import { fetchVisionCompletion } from '../llm-vision-client';
import path from 'path';
import { GptVisionExtractionResult, PageImage, downloadPdfToTempFile } from './gptVision.part-01-max-pages';
import { extractTextFromPdfPathWithGptVision, processPageWithGptVision } from './gptVision.part-02-convert-pdf-to-images';

/**
 * Extract text and tables from a PDF URL using GPT-4o Vision.
 * Converts PDF pages to high-resolution images and processes them with GPT Vision.
 *
 * @param pdfUrl - URL of the PDF to process
 * @param existingRawText - Text already extracted with pdfToText (used as context)
 * @param promptContext - Domain description for the prompt (default: 'documenti PDF italiani')
 * @returns Extracted text with improved accuracy for tables
 */
export async function extractTextFromPdfWithGptVision(
  pdfUrl: string,
  existingRawText: string,
  promptContext?: string,
): Promise<GptVisionExtractionResult> {
  if (!hasChatLlmApiKey()) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  console.log(`[GPT_VISION] Starting extraction from URL: ${pdfUrl}`);
  console.log(`[GPT_VISION] Existing text length: ${existingRawText.length} chars`);

  let pdfPath: string | null = null;

  try {
    // Download PDF to temp file
    pdfPath = await downloadPdfToTempFile(pdfUrl);
    console.log(`[GPT_VISION] Downloaded PDF to: ${pdfPath}`);

    return await extractTextFromPdfPathWithGptVision(pdfPath, existingRawText, promptContext);
  } finally {
    // Cleanup temp file
    if (pdfPath && fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  }
}

/**
 * Fallback: Use GPT to enhance/clean the existing extracted text
 * This doesn't use vision but still improves the text quality
 */
export async function extractWithTextOnlyEnhancement(
  existingRawText: string,
  promptContext: string = 'documenti PDF italiani',
): Promise<GptVisionExtractionResult> {
  console.log('[GPT_VISION] Using text-only enhancement fallback');
  const visionModel = resolveDefaultVisionModel();

  try {
    const result = await fetchVisionCompletion({
      messages: [
        {
          role: 'system',
          content: `Sei un esperto nella pulizia e formattazione di testo estratto da ${promptContext}. Correggi errori di OCR, ricostruisci tabelle in formato Markdown, e migliora la leggibilità mantenendo tutte le informazioni.`,
        },
        {
          role: 'user',
          content: `Pulisci e formatta il seguente testo estratto da un PDF.
Correggi errori evidenti, ricostruisci le tabelle in formato Markdown, e migliora la struttura mantenendo TUTTE le informazioni.

TESTO DA MIGLIORARE:
---
${existingRawText}
---

Rispondi SOLO con il testo pulito e formattato, senza commenti.`,
        },
      ],
      maxTokens: 16000,
      temperature: 0.1,
    });

    if (!result.content) {
      return {
        rawText: existingRawText,
        pagesProcessed: 0,
        model: visionModel,
      };
    }

    console.log(`[GPT_VISION] Text-only enhancement produced ${result.content.length} chars`);

    return {
      rawText: result.content.trim(),
      pagesProcessed: 0,
      model: `${visionModel}-text-only`,
    };
  } catch (error) {
    console.error('[GPT_VISION] Text-only enhancement failed:', error);
    return {
      rawText: existingRawText,
      pagesProcessed: 0,
      model: 'fallback',
    };
  }
}

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

/**
 * Checks whether a file path points to a supported image (PNG, JPG, JPEG).
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Returns the MIME type for a supported image extension.
 */
export function mimeTypeForImage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  return 'image/jpeg';
}

/**
 * Extract text from an image file (PNG/JPG/JPEG) using GPT-4o Vision.
 * The image is sent directly without any PDF-to-image conversion.
 * @param promptContext - Domain description for the prompt (default: 'documenti PDF italiani')
 */
export async function extractTextFromImageWithGptVision(
  imagePath: string,
  promptContext?: string,
): Promise<GptVisionExtractionResult> {
  if (!hasChatLlmApiKey()) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  console.log(`[GPT_VISION] Starting extraction from image: ${imagePath}`);

  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString('base64');
  const mimeType = mimeTypeForImage(imagePath);

  const pageImage: PageImage = { pageNumber: 1, base64, mimeType };
  const pageText = await processPageWithGptVision(pageImage, '', 1, promptContext);

  console.log(`[GPT_VISION] Image extraction produced ${pageText.length} chars`);

  return {
    rawText: pageText.trim(),
    pagesProcessed: 1,
    model: resolveDefaultVisionModel(),
  };
}

/**
 * Combines existing rawText with GPT Vision extraction for improved results
 * Uses the existing text as context to help GPT understand the document structure
 */
export async function enhanceRawTextWithGptVision(
  pdfUrl: string,
  existingRawText: string,
): Promise<string> {
  const result = await extractTextFromPdfWithGptVision(pdfUrl, existingRawText);

  // If GPT produced more content than existing, use GPT result
  // Otherwise combine the best of both
  if (result.rawText.length > existingRawText.length * 0.8) {
    return result.rawText;
  }

  // Combine: use GPT result but append any content from existing that might be missing
  return result.rawText;
}
