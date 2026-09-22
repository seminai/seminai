import { prisma } from '../../../repositories/Prisma';
import { PrismaBdfCacheRepository } from '../../../repositories/PrismaBdfCacheRepository';
import { createBdfClient } from './client';
import { CachedBdfClient } from './cachedClient';

let instance: CachedBdfClient | null = null;

export function createCachedBdfClient(): CachedBdfClient {
  if (!instance) {
    const client = createBdfClient();
    const cacheRepo = new PrismaBdfCacheRepository(prisma);
    instance = new CachedBdfClient(client, cacheRepo);
  }
  return instance;
}
