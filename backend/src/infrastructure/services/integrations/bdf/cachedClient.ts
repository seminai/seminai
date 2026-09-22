/**
 * CachedBdfClient - Wrapper around BdfClient that caches responses in Prisma.
 *
 * Strategy:
 * 1. On each API call, check if a cached response exists and is fresher than 7 days
 * 2. If cache hit → return cached data immediately
 * 3. If cache miss or expired → call BDF API, save to cache, return data
 */

import { createHash } from 'node:crypto';
import type { IBdfCacheRepository } from '../../../../domain/repositories/IBdfCacheRepository';
import { BdfClient } from './client';
import type {
  BdfAvversita,
  BdfColtura,
  BdfComposizione,
  BdfDistributore,
  BdfDose,
  BdfDosiParams,
  BdfImpiego,
  BdfProdListParams,
  BdfProdotto,
  BdfProdottoDati,
  BdfSostanzaAttiva,
  BdfSostanzaAttivaDati,
  BdfSostListParams,
  BdfTipologia,
} from './types';

const CACHE_MAX_AGE_DAYS = 7;

function buildCacheKey(params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return '_all_';
  const sorted = Object.keys(params)
    .sort()
    .reduce(
      (acc, key) => {
        if (params[key] !== undefined) acc[key] = params[key];
        return acc;
      },
      {} as Record<string, unknown>,
    );
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function isFresh(updatedAt: Date, maxAgeDays: number): boolean {
  const ageMs = Date.now() - updatedAt.getTime();
  return ageMs < maxAgeDays * 24 * 60 * 60 * 1000;
}

export class CachedBdfClient {
  constructor(
    private readonly client: BdfClient,
    private readonly cache: IBdfCacheRepository,
    private readonly maxAgeDays: number = CACHE_MAX_AGE_DAYS,
  ) {}

  private async cachedRequest<T>(
    endpoint: string,
    fetcher: () => Promise<T>,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const cacheKey = buildCacheKey(params);

    // 1. Check cache
    const cached = await this.cache.get(endpoint, cacheKey);
    if (cached && isFresh(cached.updatedAt, this.maxAgeDays)) {
      console.log(`[BDF Cache] HIT: ${endpoint} (key: ${cacheKey.slice(0, 8)}...)`);
      return cached.data as T;
    }

    // 2. Cache miss or expired → call BDF
    console.log(
      `[BDF Cache] ${cached ? 'EXPIRED' : 'MISS'}: ${endpoint} (key: ${cacheKey.slice(0, 8)}...) → calling BDF API`,
    );
    const data = await fetcher();

    // 3. Save to cache
    await this.cache.set(endpoint, cacheKey, data, params);

    return data;
  }

  // ============================================================
  // Proxy methods - same interface as BdfClient
  // ============================================================

  async getColture(): Promise<BdfColtura[]> {
    return this.cachedRequest('colture', () => this.client.getColture());
  }

  async getTipologie(): Promise<BdfTipologia[]> {
    return this.cachedRequest('tipologie', () => this.client.getTipologie());
  }

  async getAvversita(coltura: string | number): Promise<BdfAvversita[]> {
    const params = { coltura: String(coltura) };
    return this.cachedRequest('avversita', () => this.client.getAvversita(coltura), params);
  }

  async getProdotti(searchParams: BdfProdListParams): Promise<BdfProdotto[]> {
    return this.cachedRequest(
      'prodotti',
      () => this.client.getProdotti(searchParams),
      searchParams as unknown as Record<string, unknown>,
    );
  }

  async getProdottoDati(id: string): Promise<BdfProdottoDati[]> {
    return this.cachedRequest('proddati', () => this.client.getProdottoDati(id), { id });
  }

  async getComposizione(codice: string): Promise<BdfComposizione[]> {
    return this.cachedRequest('composizione', () => this.client.getComposizione(codice), {
      codice,
    });
  }

  async getImpieghi(codice: string): Promise<BdfImpiego[]> {
    return this.cachedRequest('impieghi', () => this.client.getImpieghi(codice), { codice });
  }

  async getDistributori(codice: string): Promise<BdfDistributore[]> {
    return this.cachedRequest('distributori', () => this.client.getDistributori(codice), {
      codice,
    });
  }

  async getSostanzeAttive(params: BdfSostListParams): Promise<BdfSostanzaAttiva[]> {
    return this.cachedRequest(
      'sostanze_attive',
      () => this.client.getSostanzeAttive(params),
      params as unknown as Record<string, unknown>,
    );
  }

  async getSostanzaAttivaDati(id: string): Promise<BdfSostanzaAttivaDati[]> {
    return this.cachedRequest('sostanza_attiva_dati', () => this.client.getSostanzaAttivaDati(id), {
      id,
    });
  }

  async getDosi(params: BdfDosiParams): Promise<BdfDose[]> {
    return this.cachedRequest(
      'dosi',
      () => this.client.getDosi(params),
      params as unknown as Record<string, unknown>,
    );
  }

  // Pittogrammi returns HTML, not worth caching in JSON
  async getPittogrammi(codice: string): Promise<string> {
    return this.client.getPittogrammi(codice);
  }

  // Access to the underlying client for authentication
  async authenticate(): Promise<string> {
    return this.client.authenticate();
  }
}
