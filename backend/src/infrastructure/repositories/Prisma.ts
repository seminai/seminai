import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolvePrismaPgSsl } from './prisma-pg-ssl';

const DEFAULT_CONNECTION_LIMIT = 100;
const DEFAULT_POOL_TIMEOUT_SECONDS = 10;
const SLOW_QUERY_THRESHOLD_MS = 1000;

declare global {
  // eslint-disable-next-line no-var
  var prisma: ReturnType<typeof createExtendedClient> | undefined;
}

function resolveNumericEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const numeric = Number.parseInt(value, 10);
  return Number.isNaN(numeric) || numeric <= 0 ? fallback : numeric;
}

function buildPrismaPg(): PrismaPg {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return new PrismaPg({ connectionString: 'postgresql://test:test@localhost:5432/test' });
    }
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return new PrismaPg({
    connectionString,
    max: resolveNumericEnv(process.env.DATABASE_CONNECTION_LIMIT, DEFAULT_CONNECTION_LIMIT),
    idleTimeoutMillis:
      resolveNumericEnv(process.env.DATABASE_POOL_TIMEOUT, DEFAULT_POOL_TIMEOUT_SECONDS) * 1000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 55_000,
    ssl: resolvePrismaPgSsl(connectionString),
  });
}

function createExtendedClient() {
  const adapter = buildPrismaPg();
  const client = new PrismaClient({ adapter });
  return client.$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        const start = performance.now();
        const result = await query(args);
        const duration = performance.now() - start;
        if (duration > SLOW_QUERY_THRESHOLD_MS) {
          console.warn(
            `[PRISMA-SLOW-QUERY] ${model ?? 'unknown'}.${operation} took ${Math.round(duration)}ms`,
          );
        }
        return result;
      },
    },
  });
}

/**
 * Creates a plain PrismaClient with pg driver adapter (for tests or standalone usage).
 */
export function createPrismaClient(): PrismaClient {
  const adapter = buildPrismaPg();
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalThis.prisma) {
    globalThis.prisma = createExtendedClient();
  }
  // Cast is safe: $extends only adds query timing, doesn't change the PrismaClient API surface
  return globalThis.prisma as unknown as PrismaClient;
}

// Lazy singleton: created on first access, not at module load time
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrismaClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Retry helper for Prisma queries that may timeout due to connection pool exhaustion
 * @param fn - Async function to execute
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delayMs - Base delay between retries in milliseconds (default: 1000)
 * @returns Result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isPoolTimeout =
        error instanceof Error &&
        (error.message.includes('Timed out fetching a new connection') ||
          error.message.includes('connection pool'));
      if (isPoolTimeout && attempt < maxRetries) {
        const delay = delayMs * attempt;
        console.warn(
          `[PRISMA-RETRY] Pool timeout on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Graceful shutdown is handled centrally in server.ts
