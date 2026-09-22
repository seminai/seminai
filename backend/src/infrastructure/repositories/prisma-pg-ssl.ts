import type { PoolConfig } from 'pg';

function isLocalDatabaseHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Resolves PostgreSQL SSL settings for Prisma's pg adapter.
 */
export function resolvePrismaPgSsl(connectionString: string): PoolConfig['ssl'] {
  const parsedUrl = new URL(connectionString);
  const sslMode = parsedUrl.searchParams.get('sslmode');
  if (process.env.DATABASE_SSL === 'true' || sslMode === 'require' || sslMode === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  if (
    process.env.DATABASE_SSL === 'false' ||
    sslMode === 'disable' ||
    isLocalDatabaseHost(parsedUrl.hostname)
  ) {
    return false;
  }
  return { rejectUnauthorized: false };
}
