/**
 * Table-aware extractor for complex disciplinari PDFs.
 * Uses GPT-4o Vision with specialized prompts to extract structured table data
 * from Italian integrated production guidelines (disciplinari).
 *
 * Features:
 * - Handles complex table layouts (horizontal/vertical orientation)
 * - Preserves table structure in Markdown format
 * - Extracts intervention limits for active substance groups
 * - Detects merged cells and nested tables
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { hasChatLlmApiKey, resolveDefaultVisionModel } from '../llm-config';
import { buildImageContentPart, fetchVisionCompletion } from '../llm-vision-client';

/**
 * Maximum pages to process (disciplinari can be very large)
 */
const MAX_PAGES = 50;

/**
 * Image resolution for table extraction (higher for table detail)
 */
const IMAGE_DPI = 250;

/**
 * Extracted table structure
 */
export interface ExtractedTable {
  readonly headers: string[];
  readonly rows: string[][];
  readonly context: {
    disease?: string; // e.g., "Escoriosi (Phomopsis viticola)"
    crop?: string; // e.g., "Vite da uva da vino"
    section?: string; // e.g., "CRITTOGAME"
    pageNumber: number;
  };
  readonly rawMarkdown: string;
}

/**
 * Intervention limit for a substance group
 */
export interface SubstanceGroupLimit {
  readonly substances: string[];
  readonly maxInterventions: number;
  readonly scope: 'anno' | 'ciclo' | 'stagione' | null;
  readonly diseases: string[];
  readonly notes: string | null;
}

/**
 * Result of table-aware extraction
 */
export interface TableAwareExtractionResult {
  readonly rawText: string;
  readonly tables: ExtractedTable[];
  readonly substanceGroupLimits: SubstanceGroupLimit[];
  readonly pagesProcessed: number;
  readonly model: string;
}

/**
 * Page image for Vision processing
 */
interface PageImage {
  readonly pageNumber: number;
  readonly base64: string;
  readonly mimeType: string;
}

/**
 * Specialized prompt for extracting disciplinari tables
 */
const DISCIPLINARE_TABLE_PROMPT = `Sei un esperto nell'estrazione di tabelle da disciplinari di produzione integrata italiani.

ANALIZZA QUESTA PAGINA e estrai TUTTE le informazioni strutturate.

FORMATO TABELLE DISCIPLINARI:
Le tabelle contengono tipicamente:
- AVVERSITA' (colonna sinistra): nome malattia/parassita (es. "Escoriosi", "Peronospora", "Black-rot")
- CRITERI DI INTERVENTO: quando e come intervenire
- S.A. E AUSILIARI: sostanze attive ammesse (es. "Folpet", "Ditianon", "Fluazinam")
- LIMITAZIONI D'USO E NOTE: vincoli su numero interventi, gruppi di sostanze

ESTRAI SPECIFICAMENTE:

1. TABELLE IN FORMATO MARKDOWN
   Usa | per separare le colonne. Esempio:
   | AVVERSITA' | CRITERI DI INTERVENTO | S.A. E AUSILIARI | LIMITAZIONI |
   |------------|----------------------|------------------|-------------|
   | Escoriosi | Soglia di intervento | Folpet | Max 12 interventi |

2. VINCOLI DI GRUPPO
   Cerca frasi come:
   - "X interventi tra Sostanza1, Sostanza2 e Sostanza3"
   - "Max X trattamenti per Sostanza1+Sostanza2"
   - "Indipendentemente dall'avversità max X interventi"

   Estrai nel formato:
   [GRUPPO_SOSTANZE: Sostanza1, Sostanza2, Sostanza3 | MAX_INTERVENTI: X | SCOPE: anno/ciclo]

3. NOTE E ASTERISCHI
   Le tabelle spesso hanno note con asterischi (*) o numeri (1), (2).
   Includi tutte le note associate alle sostanze attive.

4. STRUTTURA GERARCHICA
   Se la tabella è sotto un'intestazione (es. "VITE - DIFESA CRITTOGAME"), includila.

IMPORTANTE:
- Estrai TUTTO il testo della tabella, non riassumere
- Mantieni i nomi esatti delle sostanze attive
- Preserva i numeri (interventi, dosi) esattamente come scritti
- Se la pagina è in formato orizzontale/landscape, adattati alla rotazione
- Se vedi celle unite, indica chiaramente quali righe/colonne sono coinvolte

OUTPUT RICHIESTO:
1. Tutte le tabelle in formato Markdown
2. Lista dei vincoli di gruppo trovati
3. Note e asterischi con il loro significato`;

/**
 * Check if pdftoppm is available
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
 * Convert PDF to images using pdftoppm
 */
async function convertPdfToImages(
  pdfPath: string,
  startPage: number = 1,
  endPage: number = MAX_PAGES,
): Promise<PageImage[]> {
  const tmpDir = os.tmpdir();
  const outputPrefix = path.join(tmpDir, `table-extract-${Date.now()}`);

  if (!isPdftoppmAvailable()) {
    throw new Error('pdftoppm not available. Please install poppler-utils.');
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-png',
      '-r',
      String(IMAGE_DPI),
      '-f',
      String(startPage),
      '-l',
      String(endPage),
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
        const prefix = path.basename(outputPrefix);
        const files = fs
          .readdirSync(tmpDir)
          .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
          .sort();

        for (const file of files) {
          const filePath = path.join(tmpDir, file);
          const buffer = fs.readFileSync(filePath);
          // Extract page number from filename (e.g., "table-extract-123-01.png")
          const pageMatch = file.match(/-(\d+)\.png$/);
          const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : images.length + 1;

          images.push({
            pageNumber,
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
 * Process a single page with GPT-4o Vision for table extraction
 */
async function processPageForTables(
  image: PageImage,
  totalPages: number,
): Promise<{ text: string; groupLimits: SubstanceGroupLimit[] }> {
  const prompt = `${DISCIPLINARE_TABLE_PROMPT}

PAGINA ${image.pageNumber} di ${totalPages}

Analizza questa immagine e restituisci:
1. Il testo estratto con le tabelle in formato Markdown
2. I vincoli di gruppo trovati nel formato richiesto

Rispondi SOLO con i dati estratti.`;

  const result = await fetchVisionCompletion({
    messages: [
      {
        role: 'system',
        content:
          "Sei un esperto nell'estrazione di tabelle da disciplinari di produzione integrata. Estrai fedelmente tutte le tabelle e i vincoli di gruppo preservando la struttura in Markdown.",
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

  const rawContent = result.content;

  // Parse group limits from the extracted text
  const groupLimits = parseGroupLimits(rawContent);

  return { text: rawContent, groupLimits };
}

/**
 * Parse substance group limits from extracted text
 */
function parseGroupLimits(text: string): SubstanceGroupLimit[] {
  const limits: SubstanceGroupLimit[] = [];

  // Pattern 1: "X interventi tra Sostanza1, Sostanza2 e Sostanza3"
  const pattern1 = /(\d+)\s+interventi?\s+tra\s+([^.|\n]+)/gi;
  let match;

  while ((match = pattern1.exec(text)) !== null) {
    const maxInterventions = parseInt(match[1], 10);
    const substancesStr = match[2];

    // Parse substances (comma or "e" separated)
    const substances = substancesStr
      .split(/[,e]/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.match(/^\d+$/));

    if (substances.length >= 2) {
      limits.push({
        substances,
        maxInterventions,
        scope: 'anno',
        diseases: [],
        notes: null,
      });
    }
  }

  // Pattern 2: "[GRUPPO_SOSTANZE: ... | MAX_INTERVENTI: X | SCOPE: ...]"
  const pattern2 =
    /\[GRUPPO_SOSTANZE:\s*([^|]+)\|\s*MAX_INTERVENTI:\s*(\d+)\s*\|\s*SCOPE:\s*(\w+)\]/gi;

  while ((match = pattern2.exec(text)) !== null) {
    const substances = match[1]
      .split(/[,e]/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const maxInterventions = parseInt(match[2], 10);
    const scope = match[3].toLowerCase() as 'anno' | 'ciclo' | 'stagione';

    limits.push({
      substances,
      maxInterventions,
      scope,
      diseases: [],
      notes: null,
    });
  }

  // Deduplicate by substances
  const uniqueLimits: SubstanceGroupLimit[] = [];
  const seen = new Set<string>();

  for (const limit of limits) {
    const key = limit.substances.sort().join(',').toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLimits.push(limit);
    }
  }

  return uniqueLimits;
}

/**
 * Parse Markdown tables from text
 */
function parseMarkdownTables(text: string, pageNumber: number): ExtractedTable[] {
  const tables: ExtractedTable[] = [];

  // Split by potential table boundaries
  const lines = text.split('\n');
  let currentTable: { headers: string[]; rows: string[][]; startLine: number } | null = null;
  let context: ExtractedTable['context'] = { pageNumber };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for context headers (section names)
    if (line.match(/^#+\s*(.+)/) || line.match(/^[A-Z][A-Z\s]+$/)) {
      const headerMatch = line.match(/^#+\s*(.+)/) || [null, line];
      if (headerMatch[1]) {
        if (headerMatch[1].toLowerCase().includes('crittogam')) {
          context = { ...context, section: 'CRITTOGAME' };
        } else if (headerMatch[1].toLowerCase().includes('vite')) {
          context = { ...context, crop: 'Vite' };
        }
      }
    }

    // Check for table row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      // Check if it's a separator row (e.g., |---|---|)
      if (cells.every((c) => c.match(/^[-:]+$/))) {
        continue;
      }

      if (!currentTable) {
        // Start new table with this as header
        currentTable = { headers: cells, rows: [], startLine: i };
      } else {
        // Add as row
        currentTable.rows.push(cells);
      }
    } else if (currentTable && currentTable.rows.length > 0) {
      // End of table
      tables.push({
        headers: currentTable.headers,
        rows: currentTable.rows,
        context,
        rawMarkdown: lines
          .slice(currentTable.startLine, i)
          .filter((l) => l.trim().startsWith('|'))
          .join('\n'),
      });
      currentTable = null;
    }
  }

  // Handle table at end of text
  if (currentTable && currentTable.rows.length > 0) {
    tables.push({
      headers: currentTable.headers,
      rows: currentTable.rows,
      context,
      rawMarkdown: lines
        .slice(currentTable.startLine)
        .filter((l) => l.trim().startsWith('|'))
        .join('\n'),
    });
  }

  return tables;
}

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
