import type { PrismaClient } from '@prisma/client';
import {
  buildDisciplinareInfoKey,
  buildProductKey,
} from '../infrastructure/services/agents/dosage_agent/productAccessors';
import { calculateAdjustedTreatableArea } from '../infrastructure/services/agents/dosage_agent/fieldBufferZoneExtractor';
import { LlmCacheService } from '../infrastructure/services/agents/dosage_agent/llmCacheService';
import { ensureWarehouseForCompany } from '../infrastructure/services/agents/dosage_agent/batchLoader';

describe('dosage agent hardening regressions', () => {
  it('creates distinct disciplinare keys for the same active ingredient on different crops', () => {
    const grapeKey = buildDisciplinareInfoKey('Boscalid', 'Vite da vino');
    const appleKey = buildDisciplinareInfoKey('Boscalid', 'Melo');

    expect(grapeKey).not.toBe(appleKey);
  });

  it('creates distinct product keys for products with the same name but different registrations', () => {
    const firstKey = buildProductKey('Contor', '0016837');
    const secondKey = buildProductKey('Contor', '0099999');

    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).toBe(buildProductKey(' contor ', '0016837'));
  });

  it('marks the unit as non treatable when buffer zones consume the whole area', () => {
    const result = calculateAdjustedTreatableArea({
      currentAreaHa: 1.2,
      sauHa: 1.2,
      bufferAreaHa: 1.5,
    });

    expect(result.wasReduced).toBe(true);
    expect(result.adjustedAreaHa).toBe(0);
  });

  it('does not fetch fresh LLM data twice when cache persistence fails after computation', async () => {
    const prisma = {
      llmCacheEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error('db unavailable')),
        update: jest.fn(),
      },
    } as unknown as PrismaClient;
    const cacheService = new LlmCacheService(prisma);
    const fetchFresh = jest.fn().mockResolvedValue({ value: 'fresh' });

    const result = await cacheService.getOrRefresh({
      namespace: 'test',
      cacheKey: 'cache-key',
      model: 'model',
      promptVersion: 'v1',
      userId: 'user-1',
      computeScore: () => 1,
      fetchFresh,
    });

    expect(fetchFresh).toHaveBeenCalledTimes(1);
    expect(result.payload).toEqual({ value: 'fresh' });
    expect(result.fromCache).toBe(false);
  });

  it('returns the concurrently created default warehouse after a create race', async () => {
    const prisma = {
      warehouse: {
        findFirst: jest.fn().mockResolvedValueOnce(null),
        create: jest.fn().mockRejectedValue(new Error('duplicate create')),
        findUnique: jest.fn().mockResolvedValue({ id: 'default-warehouse-company-1' }),
      },
    } as unknown as PrismaClient;

    const warehouseId = await ensureWarehouseForCompany(prisma, 'company-1');

    expect(warehouseId).toBe('default-warehouse-company-1');
  });
});
