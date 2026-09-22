/**
 * Drops persistent vector stores so embeddings can be rebuilt from scratch.
 *
 * Usage:
 *   npx tsx scripts/cleanup/cleanupVectorStores.ts
 *   npx tsx scripts/cleanup/cleanupVectorStores.ts --dry-run
 *
 * Requires Qdrant + MongoDB (local: docker compose up -d qdrant mongodb).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { createPrismaClient } from '../../src/infrastructure/repositories/Prisma';
import {
  buildQdrantHeaders,
  normalizeQdrantUrl,
  resolveQdrantConnectionConfig,
} from '../../src/infrastructure/services/qdrant-config';

const QDRANT_COLLECTIONS = [
  'rules_knowledge_base',
  'disciplinari_bdf',
  'crop_phases_scientific_docs',
  'vector_embeddings',
] as const;

const MONGO_VECTOR_COLLECTIONS = ['disciplinari_bdf', 'vector_embeddings'] as const;

const dryRun = process.argv.includes('--dry-run');

async function qdrantRequest(
  baseUrl: string,
  apiKey: string,
  method: 'GET' | 'DELETE',
  path: string,
): Promise<Response> {
  return fetch(`${normalizeQdrantUrl(baseUrl)}${path}`, {
    method,
    headers: buildQdrantHeaders(apiKey),
  });
}

async function cleanupQdrant(): Promise<void> {
  let url: string;
  let apiKey: string;
  try {
    ({ url, apiKey } = resolveQdrantConnectionConfig());
  } catch {
    console.log('[cleanup] Skipping Qdrant — QDRANT_URL not set');
    return;
  }

  const listResponse = await qdrantRequest(url, apiKey, 'GET', '/collections');
  if (!listResponse.ok) {
    const body = await listResponse.text();
    console.warn(
      `[cleanup] Qdrant unreachable (${listResponse.status} at ${url}): ${body.slice(0, 120)}`,
    );
    console.warn('[cleanup] Start local Qdrant: docker compose up -d qdrant');
    return;
  }

  const listBody = (await listResponse.json()) as {
    result?: { collections?: Array<{ name: string }> };
  };
  const names = new Set((listBody.result?.collections ?? []).map((c) => c.name));

  for (const collectionName of QDRANT_COLLECTIONS) {
    if (!names.has(collectionName)) {
      console.log(`[cleanup] Qdrant collection not found: ${collectionName}`);
      continue;
    }
    if (dryRun) {
      console.log(`[cleanup] [dry-run] Would delete Qdrant collection: ${collectionName}`);
      continue;
    }
    const deleteResponse = await qdrantRequest(
      url,
      apiKey,
      'DELETE',
      `/collections/${collectionName}`,
    );
    if (!deleteResponse.ok) {
      throw new Error(
        `Failed to delete Qdrant collection ${collectionName}: ${deleteResponse.status}`,
      );
    }
    console.log(`[cleanup] Deleted Qdrant collection: ${collectionName}`);
  }
}

async function cleanupMongoVectorDb(): Promise<void> {
  const uri = process.env.MONGODB_VECTOR_URI || process.env.MONGO_CONNECTION_URL;
  const dbName = process.env.MONGODB_VECTOR_DB || 'seminai_be';
  if (!uri) {
    console.log('[cleanup] Skipping MongoDB vectors — MONGODB_VECTOR_URI not set');
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const existing = (await db.listCollections().toArray()).map((c) => c.name);

    for (const collectionName of MONGO_VECTOR_COLLECTIONS) {
      if (!existing.includes(collectionName)) {
        console.log(`[cleanup] MongoDB collection not found: ${dbName}.${collectionName}`);
        continue;
      }
      if (dryRun) {
        console.log(
          `[cleanup] [dry-run] Would drop MongoDB collection: ${dbName}.${collectionName}`,
        );
        continue;
      }
      await db.collection(collectionName).drop();
      console.log(`[cleanup] Dropped MongoDB collection: ${dbName}.${collectionName}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cleanup] MongoDB cleanup failed: ${message}`);
    console.warn('[cleanup] Start local MongoDB: docker compose up -d mongodb');
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function resetRuleVectorizationState(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    if (dryRun) {
      const count = await prisma.rule.count({ where: { isVectorized: true } });
      console.log(`[cleanup] [dry-run] Would reset vectorization state on ${count} Rule row(s)`);
      return;
    }
    const result = await prisma.rule.updateMany({
      data: {
        isVectorized: false,
        vectorizedAt: null,
        qdrantCollection: null,
        vectorizationError: null,
      },
    });
    console.log(`[cleanup] Reset vectorization state on ${result.count} Rule row(s) in PostgreSQL`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  console.log(`[cleanup] Starting vector store cleanup${dryRun ? ' (dry-run)' : ''}...`);
  await cleanupQdrant();
  await cleanupMongoVectorDb();
  await resetRuleVectorizationState();
  console.log('[cleanup] Done. Re-index via API/workers when ready.');
}

main().catch((error) => {
  console.error('[cleanup] Failed:', error);
  process.exit(1);
});
