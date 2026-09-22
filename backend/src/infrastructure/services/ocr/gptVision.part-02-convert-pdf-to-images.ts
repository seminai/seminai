import { buildImageContentPart, fetchVisionCompletion } from '../llm-vision-client';
import { hasChatLlmApiKey, resolveDefaultVisionModel } from '../llm-config';
import fs from 'fs';
import { GptVisionExtractionResult, PageImage, convertPdfToImagesWithImageMagick, convertPdfToImagesWithPdftoppm, isImageMagickAvailable, isPdftoppmAvailable } from './gptVision.part-01-max-pages';
import { extractWithTextOnlyEnhancement } from './gptVision.part-03-extract-text-from-pdf-with-gpt-vision';

/**
 * Convert PDF pages to images using best available method
 */
export async function convertPdfToImages(pdfPath: string): Promise<PageImage[]> {
  console.log('[GPT_VISION] Converting PDF to images...');

  if (isPdftoppmAvailable()) {
    console.log('[GPT_VISION] Using pdftoppm for conversion');
    return await convertPdfToImagesWithPdftoppm(pdfPath);
  }

  if (isImageMagickAvailable()) {
    console.log('[GPT_VISION] Using ImageMagick for conversion');
    return await convertPdfToImagesWithImageMagick(pdfPath);
  }

  throw new Error(
    'No PDF to image converter available. Please install poppler-utils (pdftoppm) or ImageMagick.',
  );
}

/**
 * Builds the GPT Vision prompt for extracting text and tables from PDF images.
 * @param promptContext - Domain description inserted into the prompt (e.g. "fatture e DDT agrari italiani").
 *   Defaults to "documenti PDF italiani" to keep the prompt neutral for generic use.
 */
export function buildGptVisionExtractionPrompt(
  existingText: string,
  pageNumber: number,
  totalPages: number,
  promptContext: string = 'documenti PDF italiani',
): string {
  const contextText =
    existingText.length > 12000
      ? existingText.substring(0, 12000) + '\n... [testo troncato] ...'
      : existingText;

  return `Sei un esperto nell'estrazione di testo e tabelle da ${promptContext}.

PAGINA ${pageNumber} di ${totalPages}

Ti viene fornita un'immagine ad alta risoluzione di questa pagina PDF. Hai anche un testo estratto automaticamente che potrebbe essere incompleto o contenere errori.

IL TUO COMPITO:
1. Analizza attentamente l'immagine della pagina PDF
2. Estrai TUTTO il testo visibile, incluse tabelle, intestazioni, note a piè di pagina
3. Preserva la struttura delle tabelle usando il formato Markdown (| colonna1 | colonna2 |)
4. Correggi eventuali errori nel testo estratto automaticamente
5. Aggiungi il testo mancante che vedi nell'immagine ma non è presente nel testo estratto

TESTO GIÀ ESTRATTO AUTOMATICAMENTE (riferimento, potrebbe essere incompleto):
---
${contextText}
---

ISTRUZIONI:
- Restituisci il testo completo e corretto estratto dall'immagine
- Per le tabelle, usa il formato Markdown con separatori | per preservare la struttura
- Mantieni la formattazione originale il più possibile (titoli, elenchi, paragrafi)
- NON omettere nessun testo visibile nell'immagine
- Includi numeri, codici, date, unità di misura esattamente come appaiono
- Se vedi caratteri speciali o simboli, trascrivili fedelmente

Rispondi SOLO con il testo estratto da questa pagina, senza commenti aggiuntivi.`;
}

/**
 * Process a single page image with GPT Vision
 */
export async function processPageWithGptVision(
  image: PageImage,
  existingText: string,
  totalPages: number,
  promptContext: string = 'documenti PDF italiani',
): Promise<string> {
  const prompt = buildGptVisionExtractionPrompt(
    existingText,
    image.pageNumber,
    totalPages,
    promptContext,
  );

  const result = await fetchVisionCompletion({
    messages: [
      {
        role: 'system',
        content: `Sei un esperto nell'estrazione di testo e tabelle da ${promptContext}. Estrai fedelmente tutto il contenuto visibile preservando la struttura delle tabelle in formato Markdown.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          buildImageContentPart(image.base64, image.mimeType, 'high'),
        ],
      },
    ],
    maxTokens: 8000,
    temperature: 0.1,
  });

  return result.content;
}

/**
 * Extract text and tables from a PDF file path using GPT-4o Vision.
 * Converts PDF pages to high-resolution images and processes them with GPT Vision.
 *
 * @param pdfPath - Local file path to the PDF to process
 * @param existingRawText - Text already extracted with pdfToText (used as context)
 * @param promptContext - Domain description for the prompt (default: 'documenti PDF italiani')
 * @returns Extracted text with improved accuracy for tables
 */
export async function extractTextFromPdfPathWithGptVision(
  pdfPath: string,
  existingRawText: string,
  promptContext?: string,
): Promise<GptVisionExtractionResult> {
  if (!hasChatLlmApiKey()) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  console.log(`[GPT_VISION] Starting extraction from file: ${pdfPath}`);
  console.log(`[GPT_VISION] Existing text length: ${existingRawText.length} chars`);

  // Convert PDF to images
  const images = await convertPdfToImages(pdfPath);
  console.log(`[GPT_VISION] Converted ${images.length} pages to images`);

  if (images.length === 0) {
    console.warn('[GPT_VISION] No images extracted, falling back to text-only enhancement');
    return await extractWithTextOnlyEnhancement(existingRawText, promptContext);
  }

  // Process pages in parallel batches to reduce latency
  const PAGE_CONCURRENCY = 3;
  const orderedPageTexts: (string | null)[] = new Array(images.length).fill(null);

  for (let i = 0; i < images.length; i += PAGE_CONCURRENCY) {
    const batch = images.slice(i, i + PAGE_CONCURRENCY);
    console.log(
      `[GPT_VISION] Processing pages batch ${Math.floor(i / PAGE_CONCURRENCY) + 1}/${Math.ceil(images.length / PAGE_CONCURRENCY)} (pages ${i + 1}-${Math.min(i + PAGE_CONCURRENCY, images.length)})`,
    );
    await Promise.all(
      batch.map(async (image, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          const pageText = await processPageWithGptVision(
            image,
            existingRawText,
            images.length,
            promptContext,
          );
          if (pageText) {
            orderedPageTexts[globalIndex] = `--- PAGINA ${image.pageNumber} ---\n${pageText}`;
          }
        } catch (err) {
          console.error(`[GPT_VISION] Error processing page ${image.pageNumber}:`, err);
        }
      }),
    );
  }

  const pageTexts = orderedPageTexts.filter((t): t is string => t !== null);
  const combinedText = pageTexts.join('\n\n');
  console.log(
    `[GPT_VISION] Total extracted text: ${combinedText.length} chars from ${pageTexts.length} pages`,
  );

  return {
    rawText: combinedText.trim(),
    pagesProcessed: pageTexts.length,
    model: resolveDefaultVisionModel(),
  };
}
