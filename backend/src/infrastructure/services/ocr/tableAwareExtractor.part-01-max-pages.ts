import { execSync, spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

/**
 * Maximum pages to process (disciplinari can be very large)
 */
export const MAX_PAGES = 50;

/**
 * Image resolution for table extraction (higher for table detail)
 */
export const IMAGE_DPI = 250;

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
export interface PageImage {
  readonly pageNumber: number;
  readonly base64: string;
  readonly mimeType: string;
}

/**
 * Specialized prompt for extracting disciplinari tables
 */
export const DISCIPLINARE_TABLE_PROMPT = `Sei un esperto nell'estrazione di tabelle da disciplinari di produzione integrata italiani.

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
export function isPdftoppmAvailable(): boolean {
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
export async function convertPdfToImages(
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
