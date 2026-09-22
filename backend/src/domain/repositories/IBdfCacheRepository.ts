export interface BdfCacheEntry {
  id: string;
  endpoint: string;
  cacheKey: string;
  params: Record<string, unknown> | null;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBdfCacheRepository {
  get(endpoint: string, cacheKey: string): Promise<BdfCacheEntry | null>;
  set(
    endpoint: string,
    cacheKey: string,
    data: unknown,
    params?: Record<string, unknown>,
  ): Promise<void>;
  invalidate(endpoint: string, cacheKey: string): Promise<void>;
  invalidateByEndpoint(endpoint: string): Promise<void>;
  invalidateExpired(maxAgeDays: number): Promise<number>;
}
