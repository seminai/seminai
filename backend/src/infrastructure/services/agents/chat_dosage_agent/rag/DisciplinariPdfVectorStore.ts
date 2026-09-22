/**
 * In-memory vector store for official Italian disciplinari PDF documents.
 * Fetches PDFs on-demand from BDF (Banca Dati Fitofarmaci) URLs,
 * parses and chunks their content, generates embeddings, and
 * provides semantic search over the extracted text.
 *
 * Dependencies already present in the project:
 *   - axios        → HTTP download
 *   - pdf-parse    → PDF text extraction
 *   - @langchain/textsplitters → recursive chunking
 *   - @langchain/openai        → OpenAI embeddings
 */

import axios from 'axios';

/**
 * Lazily loads pdf-parse to avoid triggering pdfjs-dist browser-global
 * initialisation (DOMMatrix, etc.) at module import time.
 * The function is only called when an actual PDF buffer needs to be parsed.
 */
async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('pdf-parse');
  const fn = typeof mod.default === 'function' ? mod.default : mod;
  return fn(buffer) as Promise<{ text: string }>;
}
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { OpenAIEmbeddings } from '@langchain/openai';
import { createEmbeddings } from '../../../llm-embeddings-factory';

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

interface IndexedChunk {
  chunk: DisciplinareChunk;
  embedding: number[];
}

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const DEFAULT_SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_TOP_K = 6;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const PDF_FETCH_TIMEOUT_MS = 30_000;

/**
 * Extracts a normalized region name from a disciplinare title.
 * e.g. "Disciplinare Emilia-Romagna 2025" → "emilia-romagna"
 */
function extractRegion(title: string): string {
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
function matchesFilter(entry: DisciplinareEntry, region?: string, year?: number): boolean {
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

/**
 * In-memory vector store for disciplinari PDFs.
 * Downloads and indexes PDFs lazily (only the first time a region/year is requested).
 * Subsequent queries for the same document are served from the in-memory cache.
 */
export class DisciplinariPdfVectorStore {
  private readonly catalog: DisciplinareEntry[];
  private readonly embeddings: OpenAIEmbeddings;
  private readonly splitter: RecursiveCharacterTextSplitter;
  private readonly indexedChunks: IndexedChunk[] = [];
  /** Tracks which catalog URLs have already been fetched and indexed. */
  private readonly fetchedUrls = new Set<string>();

  constructor(catalog: DisciplinareEntry[]) {
    this.catalog = catalog;
    this.embeddings = createEmbeddings({ modelName: EMBEDDING_MODEL }).embeddings;
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
    });
  }

  /**
   * Searches the indexed disciplinari for chunks relevant to the query.
   * Lazily fetches and indexes the matching PDF entries first.
   *
   * @param query Natural-language search query
   * @param region Optional region filter (e.g. "Emilia-Romagna")
   * @param year Optional year filter (e.g. 2025)
   * @param topK Maximum number of results
   * @returns Ranked search results
   */
  async search(
    query: string,
    region?: string,
    year?: number,
    topK: number = DEFAULT_TOP_K,
  ): Promise<DisciplinareSearchResult[]> {
    const matchingEntries = this.catalog.filter((e) => matchesFilter(e, region, year));

    if (matchingEntries.length === 0) {
      return [];
    }

    await this.ensureIndexed(matchingEntries);

    if (this.indexedChunks.length === 0) {
      return [];
    }

    const queryEmbedding = await this.embeddings.embedQuery(query);
    const relevant = this.indexedChunks.filter((ic) =>
      matchesFilter(
        {
          title: ic.chunk.metadata.title,
          anno: ic.chunk.metadata.year,
          url: ic.chunk.metadata.url,
        },
        region,
        year,
      ),
    );

    const scored = relevant.map((ic) => ({
      chunk: ic.chunk,
      score: this.cosineSimilarity(queryEmbedding, ic.embedding),
    }));

    return scored
      .filter((r) => r.score >= DEFAULT_SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Returns whether at least one document has been indexed.
   */
  hasDocuments(): boolean {
    return this.indexedChunks.length > 0;
  }

  /**
   * Returns a list of catalog entries available (optionally filtered).
   */
  listAvailable(region?: string, year?: number): DisciplinareEntry[] {
    return this.catalog.filter((e) => matchesFilter(e, region, year));
  }

  /**
   * Ensures all matching entries are fetched, parsed, chunked, and embedded.
   * Skips entries already present in the cache.
   */
  private async ensureIndexed(entries: DisciplinareEntry[]): Promise<void> {
    const toFetch = entries.filter((e) => !this.fetchedUrls.has(e.url));
    if (toFetch.length === 0) return;

    console.log(
      `[DisciplinariPdfVectorStore] Fetching ${toFetch.length} PDF(s): ${toFetch.map((e) => e.title).join(', ')}`,
    );

    for (const entry of toFetch) {
      try {
        const chunks = await this.fetchAndChunk(entry);
        if (chunks.length === 0) {
          console.warn(`[DisciplinariPdfVectorStore] No chunks extracted from: ${entry.title}`);
          this.fetchedUrls.add(entry.url);
          continue;
        }

        const contents = chunks.map((c) => c.content);
        const batchEmbeddings = await this.embeddings.embedDocuments(contents);

        for (let i = 0; i < chunks.length; i++) {
          this.indexedChunks.push({ chunk: chunks[i], embedding: batchEmbeddings[i] });
        }

        this.fetchedUrls.add(entry.url);
        console.log(
          `[DisciplinariPdfVectorStore] Indexed ${chunks.length} chunks for: ${entry.title}`,
        );
      } catch (error) {
        console.error(`[DisciplinariPdfVectorStore] Failed to index "${entry.title}":`, error);
        this.fetchedUrls.add(entry.url);
      }
    }
  }

  /**
   * Downloads a PDF from the entry URL, extracts text, and splits into chunks.
   */
  private async fetchAndChunk(entry: DisciplinareEntry): Promise<DisciplinareChunk[]> {
    const response = await axios.get<ArrayBuffer>(entry.url, {
      responseType: 'arraybuffer',
      timeout: PDF_FETCH_TIMEOUT_MS,
      headers: { 'User-Agent': 'Seminai-AgriBot/1.0' },
    });

    const buffer = Buffer.from(response.data);
    const parsed = await parsePdf(buffer);
    const rawText = parsed.text;

    if (!rawText || rawText.trim().length === 0) {
      return [];
    }

    const splitTexts = await this.splitter.splitText(rawText);
    const region = extractRegion(entry.title);

    return splitTexts.map((content, index) => ({
      content,
      metadata: {
        title: entry.title,
        region,
        year: entry.anno,
        url: entry.url,
        chunkIndex: index,
      },
    }));
  }

  /**
   * Cosine similarity between two vectors (returns 0–1).
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

/**
 * The full BDF disciplinari catalog from bdf.csv.
 * Covers 2024–2025 national guidelines and all Italian regions.
 */
export const BDF_DISCIPLINARI_CATALOG: DisciplinareEntry[] = [
  {
    title: 'Linee Guida Nazionali 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/linee-guida-nazionali-2025/?wpdmdl=15117&refresh=68170fe2598771746341858',
  },
  {
    title: 'Disciplinare Abruzzo 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-abruzzo-2025/?wpdmdl=15188&refresh=68170fe25ebf71746341858',
  },
  {
    title: 'Disciplinare Bacino Centro Sud Italia 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-bacino-centro-sud-italia-2025/?wpdmdl=15251&refresh=68170fe2639ed1746341858',
  },
  {
    title: 'Disciplinare Basilicata 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-basilicata-2025/?wpdmdl=15208&refresh=68170fe2691481746341858',
  },
  {
    title: 'Disciplinare Bolzano 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-bolzano-2025/?wpdmdl=15245&refresh=68170fe26f22d1746341858',
  },
  {
    title: 'Disciplinare Calabria 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-calabria-2025/?wpdmdl=15212&refresh=68170fe273c701746341858',
  },
  {
    title: 'Disciplinare Campania 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-campania-2025/?wpdmdl=15242&refresh=68170fe2783961746341858',
  },
  {
    title: 'Disciplinare Emilia-Romagna 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-emilia-romagna-2025/?wpdmdl=15112&refresh=68170fe27d1501746341858',
  },
  {
    title: 'Disciplinare Friuli Venezia Giulia 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-friuli-venezia-giulia-2025/?wpdmdl=15228&refresh=68170fe2819c91746341859',
  },
  {
    title: 'Disciplinare Lazio 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-lazio-2025/?wpdmdl=15239&refresh=68170fe28672e1746341859',
  },
  {
    title: 'Disciplinare Liguria 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-liguria-2025/?wpdmdl=15127&refresh=68170fe28c7c01746341859',
  },
  {
    title: 'Disciplinare Lombardia 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-lombardia-2025/?wpdmdl=15134&refresh=68170fe2910551746341859',
  },
  {
    title: 'Disciplinare Marche 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-marche-2025/?wpdmdl=15180&refresh=68170fe2955a51746341859',
  },
  {
    title: 'Disciplinare Molise 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-molise-2025/?wpdmdl=15236&refresh=68170fe29a2921746341859',
  },
  {
    title: 'Disciplinare Piemonte 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-piemonte-2025/?wpdmdl=15194&refresh=68170fe29ecd21746341859',
  },
  {
    title: 'Disciplinare Puglia 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-puglia-2025/?wpdmdl=15248&refresh=68170fe2a419d1746341859',
  },
  {
    title: 'Disciplinare Sardegna 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-sardegna-2025/?wpdmdl=15205&refresh=68170fe2a8f3a1746341859',
  },
  {
    title: 'Disciplinare Sicilia 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-sicilia-2025/?wpdmdl=15255&refresh=68170fe2ad5181746341859',
  },
  {
    title: 'Disciplinare Toscana 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-toscana-2025/?wpdmdl=15220&refresh=68170fe2b222b1746341859',
  },
  {
    title: 'Disciplinare Trento 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-trento-2025/?wpdmdl=15191&refresh=68170fe2b6b581746341859',
  },
  {
    title: 'Disciplinare Umbria 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-umbria-2025/?wpdmdl=15196&refresh=68170fe2bb8441746341859',
  },
  {
    title: "Disciplinare Valle D'Aosta 2025",
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-valle-daosta-2025/?wpdmdl=15224&refresh=68170fe2c04a01746341859',
  },
  {
    title: 'Disciplinare Veneto 2025',
    anno: 2025,
    url: 'https://www.bdfsrl.it/download/disciplinare-veneto-2025/?wpdmdl=15120&refresh=68170fe2c4de01746341859',
  },
  {
    title: 'Linee Guida Nazionali 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/linee-guida-nazionali-2024/?wpdmdl=14615&refresh=68170fe2c9b4e1746341858',
  },
  {
    title: 'Disciplinare Abruzzo 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-abruzzo-2024/?wpdmdl=14618&refresh=68170fe2ce4261746341858',
  },
  {
    title: 'Disciplinare Bacino Centro Sud Italia 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-bacino-centro-sud-italia-2024/?wpdmdl=14620&refresh=68170fe2d354c1746341858',
  },
  {
    title: 'Disciplinare Basilicata 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-basilicata-2024/?wpdmdl=14622&refresh=68170fe2d853e1746341858',
  },
  {
    title: 'Disciplinare Bolzano 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-bolzano-2024/?wpdmdl=14624&refresh=68170fe2dce471746341858',
  },
  {
    title: 'Disciplinare Calabria 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-calabria-2024/?wpdmdl=14626&refresh=68170fe2e2edd1746341858',
  },
  {
    title: 'Disciplinare Campania 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-campania-2024/?wpdmdl=14628&refresh=68170fe2e89bd1746341858',
  },
  {
    title: 'Disciplinare Emilia-Romagna 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-emilia-romagna-2024/?wpdmdl=14630&refresh=68170fe2edde11746341858',
  },
  {
    title: 'Disciplinare Friuli Venezia Giulia 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-friuli-venezia-giulia-2024/?wpdmdl=14632&refresh=68170fe2f38491746341858',
  },
  {
    title: 'Disciplinare Lazio 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-lazio-2024/?wpdmdl=14634&refresh=68170fe3053451746341859',
  },
  {
    title: 'Disciplinare Liguria 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-liguria-2024/?wpdmdl=14636&refresh=68170fe30aec61746341859',
  },
  {
    title: 'Disciplinare Lombardia 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-lombardia-2024/?wpdmdl=14638&refresh=68170fe310c101746341859',
  },
  {
    title: 'Disciplinare Marche 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-marche-2024/?wpdmdl=14640&refresh=68170fe315a1d1746341859',
  },
  {
    title: 'Disciplinare Molise 2024',
    anno: 2024,
    url: 'https://www.bdfsrl.it/download/disciplinare-molise-2024/?wpdmdl=14642&refresh=68170fe31a5a71746341859',
  },
];
