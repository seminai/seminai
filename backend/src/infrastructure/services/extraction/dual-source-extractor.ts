import fs from 'fs';
import { convertPdfToFlatText } from '../ocr/pdfToText';
import {
  extractTextFromPdfPathWithGptVision,
  extractTextFromImageWithGptVision,
  isImageFile,
} from '../ocr/gptVision';
import {
  extractMarkdownWithMistralOCRFromFilePath,
  extractMarkdownWithMistralOCRFromImagePath,
} from '../ocr/mistral';
import { DEFAULT_OCR_PROVIDER, type OcrProvider } from '../ocr/ocr-provider';
import {
  normalizeTablesFromMarkdown,
  serializeTableForLlm,
  type NormalizedTable,
} from './table-normalizer';

export interface DualSourceExtractionResult {
  readonly nativeText: string;
  readonly ocrMarkdown: string;
  readonly tables: readonly NormalizedTable[];
  readonly surroundingText: string;
  readonly pagesProcessed: number;
  readonly ocrModel: string;
  readonly ocrProvider: OcrProvider;
  readonly rawTextPath: string;
}

/**
 * Collects all the text/table sources for a single document (PDF or image).
 * Runs native text extraction and OCR in parallel, then normalizes any
 * markdown tables produced by the OCR pass.
 *
 * The extraction services (`extractDataFromInvoice`, `extractDataFromDDT`)
 * consume this result and pass the structured tables + surrounding text to the
 * LLM for domain-specific field extraction.
 */
export async function extractFromDocument(params: {
  filePath: string;
  ocrProvider?: OcrProvider;
  logPrefix: string;
}): Promise<DualSourceExtractionResult> {
  const { filePath, ocrProvider = DEFAULT_OCR_PROVIDER, logPrefix } = params;
  if (isImageFile(filePath)) {
    return extractFromImage(filePath, ocrProvider, logPrefix);
  }
  return extractFromPdf(filePath, ocrProvider, logPrefix);
}

async function extractFromPdf(
  pdfPath: string,
  ocrProvider: OcrProvider,
  logPrefix: string,
): Promise<DualSourceExtractionResult> {
  const startTime = Date.now();
  const [nativeSettled, ocrSettled] = await Promise.allSettled([
    runNativeExtraction(pdfPath, logPrefix),
    runOcrPdfExtraction(pdfPath, ocrProvider, logPrefix),
  ]);
  if (nativeSettled.status === 'rejected') {
    console.error(`${logPrefix} Native extraction failed:`, nativeSettled.reason);
  }
  if (ocrSettled.status === 'rejected') {
    const reason =
      ocrSettled.reason instanceof Error ? ocrSettled.reason.message : String(ocrSettled.reason);
    console.warn(`${logPrefix} OCR failed: ${reason}`);
  }
  const nativeResult =
    nativeSettled.status === 'fulfilled'
      ? nativeSettled.value
      : { text: '', path: pdfPath.replace(/\.pdf$/i, '.flat.txt') };
  const ocrResult =
    ocrSettled.status === 'fulfilled'
      ? ocrSettled.value
      : { markdown: '', pagesProcessed: 0, model: 'unavailable' };
  const normalized = normalizeTablesFromMarkdown(ocrResult.markdown);
  console.log(
    `${logPrefix} Dual-source extraction finished in ${Date.now() - startTime}ms — ` +
      `native: ${nativeResult.text.length} chars, ocr: ${ocrResult.markdown.length} chars, ` +
      `tables: ${normalized.tables.length} (${countRows(normalized.tables)} rows)`,
  );
  return {
    nativeText: nativeResult.text,
    ocrMarkdown: ocrResult.markdown,
    tables: normalized.tables,
    surroundingText: normalized.surroundingText,
    pagesProcessed: ocrResult.pagesProcessed,
    ocrModel: ocrResult.model,
    ocrProvider,
    rawTextPath: writeCombinedFile(pdfPath, nativeResult.text, ocrResult.markdown),
  };
}

async function extractFromImage(
  imagePath: string,
  ocrProvider: OcrProvider,
  logPrefix: string,
): Promise<DualSourceExtractionResult> {
  const startTime = Date.now();
  const ocrResult = await runOcrImageExtraction(imagePath, ocrProvider);
  console.log(
    `${logPrefix} Image extraction completed in ${Date.now() - startTime}ms — ` +
      `ocr: ${ocrResult.markdown.length} chars`,
  );
  const normalized = normalizeTablesFromMarkdown(ocrResult.markdown);
  return {
    nativeText: '',
    ocrMarkdown: ocrResult.markdown,
    tables: normalized.tables,
    surroundingText: normalized.surroundingText,
    pagesProcessed: ocrResult.pagesProcessed,
    ocrModel: ocrResult.model,
    ocrProvider,
    rawTextPath: imagePath,
  };
}

async function runNativeExtraction(
  pdfPath: string,
  logPrefix: string,
): Promise<{ text: string; path: string }> {
  const result = await convertPdfToFlatText(pdfPath);
  const text = result.text.trim();
  console.log(`${logPrefix} Native flat text: ${text.length} chars`);
  return { text, path: result.path };
}

async function runOcrPdfExtraction(
  pdfPath: string,
  ocrProvider: OcrProvider,
  logPrefix: string,
): Promise<{ markdown: string; pagesProcessed: number; model: string }> {
  if (ocrProvider === 'openai') {
    const result = await extractTextFromPdfPathWithGptVision(pdfPath, '');
    console.log(
      `${logPrefix} GPT Vision OCR: ${result.rawText.length} chars from ${result.pagesProcessed} pages`,
    );
    return {
      markdown: result.rawText,
      pagesProcessed: result.pagesProcessed,
      model: result.model,
    };
  }
  const markdown = await extractMarkdownWithMistralOCRFromFilePath(pdfPath);
  let pagesProcessed = 0;
  try {
    const { pageCount } = await convertPdfToFlatText(pdfPath);
    pagesProcessed = pageCount;
  } catch {
    pagesProcessed = 0;
  }
  console.log(`${logPrefix} Mistral OCR: ${markdown.length} chars`);
  return { markdown, pagesProcessed, model: 'mistral-ocr-latest' };
}

async function runOcrImageExtraction(
  imagePath: string,
  ocrProvider: OcrProvider,
): Promise<{ markdown: string; pagesProcessed: number; model: string }> {
  if (ocrProvider === 'openai') {
    const result = await extractTextFromImageWithGptVision(imagePath);
    return {
      markdown: result.rawText,
      pagesProcessed: result.pagesProcessed,
      model: result.model,
    };
  }
  const markdown = await extractMarkdownWithMistralOCRFromImagePath(imagePath);
  return { markdown, pagesProcessed: 1, model: 'mistral-ocr-latest' };
}

function countRows(tables: readonly NormalizedTable[]): number {
  return tables.reduce((acc, table) => acc + table.rows.length, 0);
}

function writeCombinedFile(pdfPath: string, nativeText: string, ocrText: string): string {
  const combined = [
    nativeText ? `=== NATIVE PDF TEXT ===\n${nativeText}` : '',
    ocrText ? `=== OCR MARKDOWN ===\n${ocrText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  if (!combined) return pdfPath.replace(/\.pdf$/i, '.flat.txt');
  const outputPath = pdfPath.replace(/\.pdf$/i, '_combined.txt');
  try {
    fs.writeFileSync(outputPath, combined);
  } catch {
    // Non-fatal: ignore write errors (e.g. read-only FS)
  }
  return outputPath;
}

/**
 * Builds the LLM input payload used by invoice/DDT structured-output calls.
 *
 * We feed the model three complementary views of the same document so it can
 * cross-reference them:
 *   1. STRUCTURED TABLE ROWS – rows we managed to normalize from the OCR
 *      markdown (column alignment already solved).
 *   2. OCR FULL MARKDOWN – the entire OCR output, including tables we failed
 *      to normalize. This is critical for multi-page / multi-document PDFs
 *      where only the first table is well-formed and later tables have
 *      OCR-corrupted headers (e.g. "ARTICOIO" / "DESCRIPITÀ") or stray
 *      separator rows that break the normalizer. Without this section, the
 *      LLM would silently miss every row after the first clean table.
 *   3. NATIVE PDF TEXT – reliable source for supplier names, document numbers
 *      and dates (no OCR hallucination risk).
 */
export function buildLlmInputPayload(result: DualSourceExtractionResult): string {
  const sections: string[] = [];
  if (result.tables.length > 0) {
    sections.push('=== STRUCTURED TABLE ROWS (from OCR markdown) ===');
    sections.push(serializeTableForLlm(result.tables));
  }
  if (result.ocrMarkdown) {
    sections.push(
      '=== OCR FULL MARKDOWN (use this to recover rows not present in the structured table) ===',
    );
    sections.push(result.ocrMarkdown);
  } else if (result.surroundingText) {
    sections.push('=== OCR SURROUNDING TEXT (headers/footers/notes) ===');
    sections.push(result.surroundingText);
  }
  if (result.nativeText) {
    sections.push('=== NATIVE PDF TEXT (reliable for supplier, numbers, dates) ===');
    sections.push(result.nativeText);
  }
  return sections.join('\n\n').trim();
}
