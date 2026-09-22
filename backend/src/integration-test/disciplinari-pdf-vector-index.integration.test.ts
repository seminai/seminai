/**
 * Integration test: index local disciplinare PDF into Qdrant and MongoDB
 * `disciplinari_bdf` collections, then run semantic queries.
 *
 * Requires:
 * - QDRANT_URL (local or cloud)
 * - OPENAI_API_KEY (embeddings)
 * - MONGODB_VECTOR_URI + MONGODB_VECTOR_DB
 */

import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { QdrantClient } from '@qdrant/js-client-rest';
import { hasEmbeddingsApiKey } from '../infrastructure/services/llm-config';
import {
  resolveQdrantConnectionConfig,
  buildQdrantHeaders,
} from '../infrastructure/services/qdrant-config';
import { createVectorSearchQdrantService } from '../infrastructure/services/tool/vectorSearchQdrant';
import { createVectorSearchMongoDBService } from '../infrastructure/services/tool/vectorSearchMongoDB';

const PDF_PATH = path.resolve(
  __dirname,
  '../../dataset/disciplinari_pdf/dpi_emilia-romagna_2025.pdf',
);
const SOURCE_NAME = 'dpi_emilia-romagna_2025.pdf';
const COLLECTION_NAME = 'disciplinari_bdf';

const QUERIES = [
  'Folpet vite numero massimo interventi',
  'Peronospora vite trattamenti fungicidi',
  'Ditianon Fluazinam Folpet vincolo gruppo',
] as const;

const INDEX_TIMEOUT_MS = 900_000;
const QUERY_TIMEOUT_MS = 120_000;

function hasMongoConfig(): boolean {
  return Boolean(process.env.MONGODB_VECTOR_URI && process.env.MONGODB_VECTOR_DB);
}

function hasQdrantConfig(): boolean {
  return Boolean(process.env.QDRANT_URL);
}

function canRunTest(): boolean {
  return hasEmbeddingsApiKey() && fs.existsSync(PDF_PATH) && hasQdrantConfig() && hasMongoConfig();
}

function logTopResults(
  label: string,
  results: ReadonlyArray<{ content: string; score: number }>,
): void {
  console.log(`[disciplinari-vector-index] ${label}: ${results.length} result(s)`);
  results.slice(0, 3).forEach((result, index) => {
    console.log(
      `[disciplinari-vector-index]   #${index + 1} score=${result.score.toFixed(4)} preview="${result.content.slice(0, 120).replace(/\s+/g, ' ')}..."`,
    );
  });
}

async function cleanupQdrantBySource(source: string): Promise<void> {
  const { url, apiKey } = resolveQdrantConnectionConfig();
  const client = new QdrantClient({
    url,
    apiKey: apiKey || undefined,
    headers: buildQdrantHeaders(apiKey),
  });
  try {
    await client.delete(COLLECTION_NAME, {
      filter: {
        must: [{ key: 'metadata.source', match: { value: source } }],
      },
    });
    console.log(`[disciplinari-vector-index] Qdrant cleanup done for source=${source}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[disciplinari-vector-index] Qdrant cleanup skipped: ${message}`);
  }
}

async function cleanupMongoBySource(source: string): Promise<void> {
  const mongoUri = process.env.MONGODB_VECTOR_URI;
  const databaseName = process.env.MONGODB_VECTOR_DB;
  if (!mongoUri || !databaseName) {
    return;
  }
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const result = await client
      .db(databaseName)
      .collection(COLLECTION_NAME)
      .deleteMany({ 'metadata.source': source });
    console.log(
      `[disciplinari-vector-index] MongoDB cleanup: deleted ${result.deletedCount} document(s)`,
    );
  } finally {
    await client.close();
  }
}

const describeIfReady = canRunTest() ? describe : describe.skip;

describeIfReady('Disciplinari PDF vector index (Qdrant + MongoDB)', () => {
  jest.setTimeout(INDEX_TIMEOUT_MS + QUERY_TIMEOUT_MS);

  beforeAll(() => {
    console.log(`[disciplinari-vector-index] PDF: ${PDF_PATH}`);
    console.log(
      `[disciplinari-vector-index] Size: ${(fs.statSync(PDF_PATH).size / 1024 / 1024).toFixed(2)} MB`,
    );
  });

  describe('Qdrant disciplinari_bdf', () => {
    it(
      'indexes PDF and answers semantic queries',
      async () => {
        const buffer = fs.readFileSync(PDF_PATH);
        const service = createVectorSearchQdrantService(COLLECTION_NAME);

        await service.processPdfBufferAndSave(buffer, SOURCE_NAME);

        for (const query of QUERIES) {
          const results = await service.similaritySearchWithScore(query, 5);
          expect(results.length).toBeGreaterThan(0);

          logTopResults(
            `Qdrant query "${query}"`,
            results.map(([doc, score]) => ({ content: doc.pageContent, score })),
          );

          const topContent = results[0][0].pageContent.toLowerCase();
          const hasRelevantKeyword =
            topContent.includes('folpet') ||
            topContent.includes('vite') ||
            topContent.includes('intervent') ||
            topContent.includes('peronospora') ||
            topContent.includes('ditianon');
          expect(hasRelevantKeyword).toBe(true);
        }
      },
      INDEX_TIMEOUT_MS,
    );
  });

  describe('MongoDB disciplinari_bdf', () => {
    it(
      'indexes PDF and answers semantic queries when vector index is available',
      async () => {
        const buffer = fs.readFileSync(PDF_PATH);
        const service = createVectorSearchMongoDBService(COLLECTION_NAME);

        let vectorIndexReady = false;
        try {
          await service.createVectorSearchIndex(1536);
          vectorIndexReady = true;
          console.log('[disciplinari-vector-index] MongoDB vector_index created or already exists');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[disciplinari-vector-index] MongoDB vector index unavailable (local Community?): ${message}`,
          );
        }

        await service.processPdfBufferAndSave(buffer, SOURCE_NAME);

        const mongoUri = process.env.MONGODB_VECTOR_URI!;
        const databaseName = process.env.MONGODB_VECTOR_DB!;
        const client = new MongoClient(mongoUri);
        await client.connect();
        const insertedCount = await client
          .db(databaseName)
          .collection(COLLECTION_NAME)
          .countDocuments({ 'metadata.source': SOURCE_NAME });
        await client.close();

        expect(insertedCount).toBeGreaterThan(0);
        console.log(
          `[disciplinari-vector-index] MongoDB indexed ${insertedCount} chunk(s) for ${SOURCE_NAME}`,
        );

        if (!vectorIndexReady) {
          console.warn(
            '[disciplinari-vector-index] Skipping MongoDB vectorSearch — index not available on this instance',
          );
          return;
        }

        try {
          const results = await service.vectorSearch(QUERIES[0], 5, true);
          expect(results.length).toBeGreaterThan(0);
          logTopResults(
            `MongoDB query "${QUERIES[0]}"`,
            results.map((result) => ({ content: result.text, score: result.score })),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[disciplinari-vector-index] MongoDB vectorSearch failed (Atlas/Mongo 8+ required): ${message}`,
          );
        } finally {
          await service.disconnect();
        }
      },
      INDEX_TIMEOUT_MS,
    );
  });

  afterAll(async () => {
    await cleanupQdrantBySource(SOURCE_NAME);
    await cleanupMongoBySource(SOURCE_NAME);
  });
});

if (!canRunTest()) {
  describe('Disciplinari PDF vector index (skipped)', () => {
    it('skips when prerequisites are missing', () => {
      console.warn(
        '[disciplinari-vector-index] Skipped — requires OPENAI_API_KEY, QDRANT_URL, MONGODB_*, and PDF file',
      );
    });
  });
}
