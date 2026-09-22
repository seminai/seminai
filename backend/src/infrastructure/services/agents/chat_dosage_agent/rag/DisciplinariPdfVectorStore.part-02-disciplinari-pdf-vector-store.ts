import type { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createEmbeddings } from '../../../llm-embeddings-factory';
import axios from 'axios';
import { CHUNK_OVERLAP, CHUNK_SIZE, DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_TOP_K, DisciplinareChunk, DisciplinareEntry, DisciplinareSearchResult, EMBEDDING_MODEL, IndexedChunk, PDF_FETCH_TIMEOUT_MS, extractRegion, matchesFilter, parsePdf } from './DisciplinariPdfVectorStore.part-01-parse-pdf';

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
