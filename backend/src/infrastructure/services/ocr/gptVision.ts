import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { hasChatLlmApiKey, resolveDefaultVisionModel } from '../llm-config';
import { buildImageContentPart, fetchVisionCompletion } from '../llm-vision-client';
/**
 * Upper bound on PDF pages processed by GPT Vision. Previously hard-coded to 10,
 * which silently truncated long invoices / DDTs. Now configurable via env var
 * `GPT_VISION_MAX_PAGES` with a generous default (40) so full multi-page documents
 * reach the LLM unless the user explicitly lowers it for cost reasons.
 */
const MAX_PAGES = Number.parseInt(process.env['GPT_VISION_MAX_PAGES'] ?? '40', 10);
const IMAGE_DPI = 200; // High resolution for better OCR

interface GptVisionExtractionResult {
  readonly rawText: string;
  readonly pagesProcessed: number;
  readonly model: string;
}

interface PageImage {
  readonly pageNumber: number;
  readonly base64: string;
  readonly mimeType: string;
}

/**
 * Downloads a PDF from URL to a temporary file
 */
async function downloadPdfToTempFile(pdfUrl: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(pdfUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
  });
  if (response.status < 200 || response.status >= 300 || !response.data) {
    throw new Error(`Failed to download PDF: status ${response.status}`);
  }
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `gpt-vision-${Date.now()}.pdf`);
  const buffer = Buffer.from(response.data);
  fs.writeFileSync(tmpFile, new Uint8Array(buffer));
  return tmpFile;
}

/**
 * Check if pdftoppm (poppler-utils) is available on the system
 */
function isPdftoppmAvailable(): boolean {
  try {
    execSync('which pdftoppm', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert PDF pages to PNG images using pdftoppm (poppler-utils)
 * Returns array of base64 encoded images, max 10 pages
 */
async function convertPdfToImagesWithPdftoppm(pdfPath: string): Promise<PageImage[]> {
  const tmpDir = os.tmpdir();
  const outputPrefix = path.join(tmpDir, `gpt-vision-page-${Date.now()}`);

  return new Promise((resolve, reject) => {
    const args = [
      '-png',
      '-r',
      String(IMAGE_DPI),
      '-l',
      String(MAX_PAGES), // last page to convert
      pdfPath,
      outputPrefix,
    ];

    const process = spawn('pdftoppm', args);
    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`pdftoppm failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const images: PageImage[] = [];
        const files = fs
          .readdirSync(tmpDir)
          .filter(
            (f) =>
              f.startsWith(`gpt-vision-page-${path.basename(outputPrefix).split('-').pop()}`) &&
              f.endsWith('.png'),
          )
          .sort();

        for (let i = 0; i < Math.min(files.length, MAX_PAGES); i++) {
          const filePath = path.join(tmpDir, files[i]);
          const buffer = fs.readFileSync(filePath);
          images.push({
            pageNumber: i + 1,
            base64: buffer.toString('base64'),
            mimeType: 'image/png',
          });
          fs.unlinkSync(filePath); // Cleanup
        }

        resolve(images);
      } catch (err) {
        reject(err);
      }
    });

    process.on('error', reject);
  });
}

/**
 * Alternative: Convert PDF to images using ImageMagick convert (if available)
 */
async function convertPdfToImagesWithImageMagick(pdfPath: string): Promise<PageImage[]> {
  const tmpDir = os.tmpdir();
  const outputPattern = path.join(tmpDir, `gpt-vision-im-${Date.now()}-%03d.png`);

  return new Promise((resolve, reject) => {
    const args = [
      '-density',
      String(IMAGE_DPI),
      '-quality',
      '95',
      `${pdfPath}[0-${MAX_PAGES - 1}]`, // First 10 pages (0-indexed)
      outputPattern,
    ];

    const process = spawn('convert', args);
    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`ImageMagick convert failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const images: PageImage[] = [];
        const baseName = `gpt-vision-im-${path.basename(outputPattern).split('-')[2].split('%')[0]}`;
        const files = fs
          .readdirSync(tmpDir)
          .filter((f) => f.includes(baseName) && f.endsWith('.png'))
          .sort();

        for (let i = 0; i < Math.min(files.length, MAX_PAGES); i++) {
          const filePath = path.join(tmpDir, files[i]);
          const buffer = fs.readFileSync(filePath);
          images.push({
            pageNumber: i + 1,
            base64: buffer.toString('base64'),
            mimeType: 'image/png',
          });
          fs.unlinkSync(filePath);
        }

        resolve(images);
      } catch (err) {
        reject(err);
      }
    });

    process.on('error', reject);
  });
}

/**
 * Check if ImageMagick convert is available
 */
function isImageMagickAvailable(): boolean {
  try {
    execSync('which convert', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert PDF pages to images using best available method
 */
async function convertPdfToImages(pdfPath: string): Promise<PageImage[]> {
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
function buildGptVisionExtractionPrompt(
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
async function processPageWithGptVision(
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
async function extractWithTextOnlyEnhancement(
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

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

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
function mimeTypeForImage(filePath: string): string {
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
