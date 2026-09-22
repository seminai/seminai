import { hasChatLlmApiKey, resolveDefaultVisionModel } from '../llm-config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import { ExtractedTable, MAX_PAGES, SubstanceGroupLimit, TableAwareExtractionResult, convertPdfToImages } from './tableAwareExtractor.part-01-max-pages';
import { parseMarkdownTables, processPageForTables } from './tableAwareExtractor.part-02-process-page-for-tables';

/**
 * Extract tables and structured data from a disciplinare PDF using GPT-4o Vision.
 *
 * @param pdfPath - Local path to the PDF file
 * @param options - Extraction options
 * @returns Extracted tables and substance group limits
 */
export async function extractTablesFromDisciplinarePdf(
  pdfPath: string,
  options: {
    startPage?: number;
    endPage?: number;
    concurrency?: number;
  } = {},
): Promise<TableAwareExtractionResult> {
  if (!hasChatLlmApiKey()) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  const { startPage = 1, endPage = MAX_PAGES, concurrency = 3 } = options;

  console.log(`[TABLE_EXTRACTOR] Starting extraction from: ${pdfPath}`);
  console.log(`[TABLE_EXTRACTOR] Pages: ${startPage} to ${endPage}, Concurrency: ${concurrency}`);

  // Convert PDF to images
  const images = await convertPdfToImages(pdfPath, startPage, endPage);
  console.log(`[TABLE_EXTRACTOR] Converted ${images.length} pages to images`);

  if (images.length === 0) {
    return {
      rawText: '',
      tables: [],
      substanceGroupLimits: [],
      pagesProcessed: 0,
      model: resolveDefaultVisionModel(),
    };
  }

  // Process pages with controlled concurrency
  const allTexts: string[] = [];
  const allTables: ExtractedTable[] = [];
  const allGroupLimits: SubstanceGroupLimit[] = [];

  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    console.log(
      `[TABLE_EXTRACTOR] Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(images.length / concurrency)}`,
    );

    const results = await Promise.all(
      batch.map(async (image) => {
        try {
          console.log(`[TABLE_EXTRACTOR] Processing page ${image.pageNumber}...`);
          const result = await processPageForTables(image, images.length);

          // Parse tables from the extracted text
          const tables = parseMarkdownTables(result.text, image.pageNumber);

          return {
            pageNumber: image.pageNumber,
            text: result.text,
            tables,
            groupLimits: result.groupLimits,
          };
        } catch (err) {
          console.error(`[TABLE_EXTRACTOR] Error on page ${image.pageNumber}:`, err);
          return {
            pageNumber: image.pageNumber,
            text: '',
            tables: [],
            groupLimits: [],
          };
        }
      }),
    );

    for (const result of results) {
      if (result.text) {
        allTexts.push(`--- PAGINA ${result.pageNumber} ---\n${result.text}`);
      }
      allTables.push(...result.tables);
      allGroupLimits.push(...result.groupLimits);
    }
  }

  // Deduplicate group limits across pages
  const uniqueGroupLimits: SubstanceGroupLimit[] = [];
  const seenGroups = new Set<string>();

  for (const limit of allGroupLimits) {
    const key = limit.substances.sort().join(',').toLowerCase();
    if (!seenGroups.has(key)) {
      seenGroups.add(key);
      uniqueGroupLimits.push(limit);
    }
  }

  console.log(`[TABLE_EXTRACTOR] Extraction complete:`);
  console.log(`[TABLE_EXTRACTOR]   - Pages processed: ${allTexts.length}`);
  console.log(`[TABLE_EXTRACTOR]   - Tables found: ${allTables.length}`);
  console.log(`[TABLE_EXTRACTOR]   - Group limits found: ${uniqueGroupLimits.length}`);

  return {
    rawText: allTexts.join('\n\n'),
    tables: allTables,
    substanceGroupLimits: uniqueGroupLimits,
    pagesProcessed: allTexts.length,
    model: resolveDefaultVisionModel(),
  };
}

/**
 * Extract tables from a PDF URL
 */
export async function extractTablesFromDisciplinareUrl(
  pdfUrl: string,
  options: {
    startPage?: number;
    endPage?: number;
    concurrency?: number;
  } = {},
): Promise<TableAwareExtractionResult> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `disciplinare-${Date.now()}.pdf`);

  try {
    // Download PDF
    console.log(`[TABLE_EXTRACTOR] Downloading PDF from: ${pdfUrl}`);
    const response = await axios.get<ArrayBuffer>(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
    });

    fs.writeFileSync(tmpFile, new Uint8Array(response.data));
    console.log(`[TABLE_EXTRACTOR] Downloaded to: ${tmpFile}`);

    return await extractTablesFromDisciplinarePdf(tmpFile, options);
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}
