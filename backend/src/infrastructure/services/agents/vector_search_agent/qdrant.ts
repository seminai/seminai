// Define a minimal client interface to avoid importing ESM types in CJS context.
import { resolveQdrantConnectionConfig } from '../../qdrant-config';

interface QdrantClientLike {
  getCollections(): Promise<{ collections: Array<{ name: string }> }>;
  createCollection(name: string, options: unknown): Promise<unknown>;
  upsert(collection: string, payload: unknown): Promise<unknown>;
  search(
    collection: string,
    options: unknown,
  ): Promise<Array<{ score: number; payload?: Record<string, unknown> | null }>>;
}
// Qdrant client is ESM-only; use dynamic import to load it from CommonJS context.
async function createQdrantClient(): Promise<QdrantClientLike> {
  const { QdrantClient } = await import('@qdrant/js-client-rest');
  const { url, apiKey } = resolveQdrantConnectionConfig();
  const client = new QdrantClient({
    url,
    apiKey: apiKey || undefined,
  });
  return client;
}

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    source: string;
    pageNumber?: number;
    chunkIndex: number;
  };
}

interface SaveEmbeddingsParams {
  collectionName: string;
  embeddings: Array<{
    content: string;
    embedding: number[];
    metadata: {
      source: string;
      pageNumber?: number;
      chunkIndex: number;
    };
  }>;
  vectorSize: number;
}

/**
 * Salva gli embedding in Qdrant.
 * Crea la collection se non esiste e inserisce i punti vettoriali.
 *
 * @param params - Parametri per salvare gli embedding
 * @returns Promise<void>
 */
export async function saveEmbeddingsToQdrant(params: SaveEmbeddingsParams): Promise<void> {
  const { collectionName, embeddings, vectorSize } = params;
  const client = await createQdrantClient();
  console.log(`Connecting to Qdrant at ${process.env.QDRANT_URL}`);
  try {
    const collections = await client.getCollections();
    const collectionExists = collections.collections.some((col) => col.name === collectionName);
    if (!collectionExists) {
      console.log(`Creating collection: ${collectionName}`);
      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      });
      console.log(`Collection ${collectionName} created successfully`);
    } else {
      console.log(`Collection ${collectionName} already exists`);
    }
  } catch (error) {
    console.error('Error checking/creating collection:', error);
    throw error;
  }
  console.log(`Preparing ${embeddings.length} points for insertion...`);
  const points: QdrantPoint[] = embeddings.map((emb, index) => ({
    id: `${emb.metadata.source}-${emb.metadata.chunkIndex}-${index}`,
    vector: emb.embedding,
    payload: {
      content: emb.content,
      source: emb.metadata.source,
      pageNumber: emb.metadata.pageNumber,
      chunkIndex: emb.metadata.chunkIndex,
    },
  }));
  const batchSize = 100;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    console.log(
      `Inserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(points.length / batchSize)}...`,
    );
    await client.upsert(collectionName, {
      wait: true,
      points: batch,
    });
  }
  console.log(`Successfully saved ${points.length} embeddings to collection ${collectionName}`);
}

interface SearchResult {
  content: string;
  source: string;
  pageNumber?: number;
  chunkIndex: number;
  score: number;
}

interface SearchParams {
  collectionName: string;
  queryEmbedding: number[];
  limit?: number;
  scoreThreshold?: number;
}

/**
 * Cerca documenti simili in Qdrant utilizzando un embedding di query.
 *
 * @param params - Parametri per la ricerca
 * @returns Array di risultati ordinati per similarità
 */
export async function searchSimilarDocuments(params: SearchParams): Promise<SearchResult[]> {
  const { collectionName, queryEmbedding, limit = 5, scoreThreshold = 0.7 } = params;
  const client = await createQdrantClient();
  console.log(`Searching in collection: ${collectionName}`);
  const searchResult = await client.search(collectionName, {
    vector: queryEmbedding,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
  });
  const results: SearchResult[] = searchResult.map((result) => {
    const payload = (result.payload ?? undefined) as Record<string, unknown> | undefined;
    const content = typeof payload?.content === 'string' ? (payload.content as string) : '';
    const source = typeof payload?.source === 'string' ? (payload.source as string) : '';
    const pageNumber =
      typeof payload?.pageNumber === 'number' ? (payload.pageNumber as number) : undefined;
    const chunkIndex = typeof payload?.chunkIndex === 'number' ? (payload.chunkIndex as number) : 0;
    return {
      content,
      source,
      pageNumber,
      chunkIndex,
      score: result.score,
    };
  });
  console.log(`Found ${results.length} similar documents`);
  return results;
}
