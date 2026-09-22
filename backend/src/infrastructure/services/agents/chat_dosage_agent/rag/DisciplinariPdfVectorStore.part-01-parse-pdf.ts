/**
 * Lazily loads pdf-parse to avoid triggering pdfjs-dist browser-global
 * initialisation (DOMMatrix, etc.) at module import time.
 * The function is only called when an actual PDF buffer needs to be parsed.
 */
export async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  type LegacyPdfParser = (input: Buffer) => Promise<{ text: string }>;
  const moduleValue: unknown = await import('pdf-parse');
  const defaultExport =
    moduleValue && typeof moduleValue === 'object' && 'default' in moduleValue
      ? moduleValue.default
      : undefined;
  const parser =
    typeof defaultExport === 'function'
      ? (defaultExport as LegacyPdfParser)
      : typeof moduleValue === 'function'
        ? (moduleValue as LegacyPdfParser)
        : null;
  if (!parser) throw new Error('The configured pdf-parse package has no legacy parser export');
  return parser(buffer);
}

/**
 * A single entry from the BDF CSV catalog.
 */
export interface DisciplinareEntry {
  readonly title: string;
  readonly anno: number;
  readonly url: string;
}

/**
 * A chunk of text extracted from a disciplinare PDF.
 */
export interface DisciplinareChunk {
  readonly content: string;
  readonly metadata: {
    readonly title: string;
    readonly region: string;
    readonly year: number;
    readonly url: string;
    readonly chunkIndex: number;
  };
}

/**
 * Result of a semantic search over disciplinare chunks.
 */
export interface DisciplinareSearchResult {
  readonly chunk: DisciplinareChunk;
  readonly score: number;
}

export interface IndexedChunk {
  chunk: DisciplinareChunk;
  embedding: number[];
}

export const CHUNK_SIZE = 800;

export const CHUNK_OVERLAP = 100;

export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

export const DEFAULT_TOP_K = 6;

export const EMBEDDING_MODEL = 'text-embedding-3-small';

export const PDF_FETCH_TIMEOUT_MS = 30_000;

/**
 * Extracts a normalized region name from a disciplinare title.
 * e.g. "Disciplinare Emilia-Romagna 2025" → "emilia-romagna"
 */
export function extractRegion(title: string): string {
  return title
    .toLowerCase()
    .replace(/^disciplinare\s+/, '')
    .replace(/^linee guida\s+/, '')
    .replace(/\s+\d{4}$/, '')
    .trim();
}

/**
 * Checks whether a disciplinare entry matches the requested region/year filters.
 */
export function matchesFilter(entry: DisciplinareEntry, region?: string, year?: number): boolean {
  const entryRegion = extractRegion(entry.title);
  if (year && entry.anno !== year) return false;
  if (region) {
    const normalizedRequest = region.toLowerCase().trim();
    if (!entryRegion.includes(normalizedRequest) && !normalizedRequest.includes(entryRegion)) {
      return false;
    }
  }
  return true;
}
