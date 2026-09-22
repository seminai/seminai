/**
 * Indexes the public local disciplinare PDF in optional Qdrant and runs semantic queries.
 * Requires QDRANT_URL, an embeddings provider, and the tracked public PDF snapshot.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs';
import path from 'path';
import { hasEmbeddingsApiKey } from '../infrastructure/services/llm-config';
import {
  buildQdrantHeaders,
  resolveQdrantConnectionConfig,
} from '../infrastructure/services/qdrant-config';
import { createVectorSearchQdrantService } from '../infrastructure/services/tool/vectorSearchQdrant';

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
const canRunTest = (): boolean =>
  hasEmbeddingsApiKey() && fs.existsSync(PDF_PATH) && Boolean(process.env.QDRANT_URL);

const cleanupBySource = async (): Promise<void> => {
  const { url, apiKey } = resolveQdrantConnectionConfig();
  const client = new QdrantClient({
    url,
    apiKey: apiKey || undefined,
    headers: buildQdrantHeaders(apiKey),
  });
  try {
    await client.delete(COLLECTION_NAME, {
      filter: { must: [{ key: 'metadata.source', match: { value: SOURCE_NAME } }] },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[disciplinari-vector-index] Qdrant cleanup skipped: ${message}`);
  }
};

const describeIfReady = canRunTest() ? describe : describe.skip;

describeIfReady('Disciplinari PDF vector index (Qdrant)', () => {
  jest.setTimeout(1_020_000);

  it('indexes the PDF and answers semantic queries', async () => {
    const service = createVectorSearchQdrantService(COLLECTION_NAME);
    await service.processPdfBufferAndSave(fs.readFileSync(PDF_PATH), SOURCE_NAME);
    for (const query of QUERIES) {
      const results = await service.similaritySearchWithScore(query, 5);
      expect(results.length).toBeGreaterThan(0);
      const content = results[0][0].pageContent.toLowerCase();
      expect(
        ['folpet', 'vite', 'intervent', 'peronospora', 'ditianon'].some((keyword) =>
          content.includes(keyword),
        ),
      ).toBe(true);
    }
  });

  afterAll(cleanupBySource);
});

if (!canRunTest()) {
  describe('Disciplinari PDF vector index (skipped)', () => {
    it('skips when prerequisites are missing', () => {
      console.warn(
        '[disciplinari-vector-index] Skipped: requires embeddings, QDRANT_URL, and public PDF',
      );
    });
  });
}
