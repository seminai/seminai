jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {
    productCropMatchCache: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { prisma } from '../../../../repositories/Prisma';
import {
  lookupProductCropMatch,
  storeProductCropMatch,
  normalizeKey,
  __testing,
} from '../productCropMatchCache';

const findUnique = prisma.productCropMatchCache.findUnique as unknown as jest.Mock;
const upsert = prisma.productCropMatchCache.upsert as unknown as jest.Mock;

describe('productCropMatchCache key building', () => {
  it('normalizes via trim + lowercase', () => {
    expect(normalizeKey('  Vite  ')).toBe('vite');
    expect(normalizeKey('GRANO TENERO')).toBe('grano tenero');
    expect(normalizeKey(undefined)).toBe('');
    expect(normalizeKey(null)).toBe('');
  });

  it('returns null key when registration number or crop is missing', () => {
    expect(__testing.buildKey(null, 'Vite', null)).toBeNull();
    expect(__testing.buildKey('013581', '', null)).toBeNull();
    expect(__testing.buildKey('013581', null, null)).toBeNull();
  });
});

describe('lookupProductCropMatch', () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it('returns null on missing key (no DB call)', async () => {
    const actual = await lookupProductCropMatch(null, 'Vite', null);
    expect(actual).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('returns the cached row when present and fresh', async () => {
    findUnique.mockResolvedValueOnce({
      isCompatible: true,
      confidence: 95,
      reason: 'Direct match',
      matchedCrops: ['vite'],
      updatedAt: new Date(),
    });

    const actual = await lookupProductCropMatch('013581', 'Vite', 'Sangiovese');

    expect(actual).toEqual({
      isCompatible: true,
      confidence: 95,
      reason: 'Direct match',
      matchedCrops: ['vite'],
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        registrationNumber_cropNameNorm_varietyNorm: {
          registrationNumber: '013581',
          cropNameNorm: 'vite',
          varietyNorm: 'sangiovese',
        },
      },
    });
  });

  it('returns null when row is older than TTL', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    findUnique.mockResolvedValueOnce({
      isCompatible: true,
      confidence: 95,
      reason: 'Stale match',
      matchedCrops: [],
      updatedAt: fortyDaysAgo,
    });

    const actual = await lookupProductCropMatch('013581', 'Vite', null);

    expect(actual).toBeNull();
  });

  it('returns null on DB error (cache miss fallback)', async () => {
    findUnique.mockRejectedValueOnce(new Error('connection refused'));

    const actual = await lookupProductCropMatch('013581', 'Vite', null);

    expect(actual).toBeNull();
  });
});

describe('storeProductCropMatch', () => {
  beforeEach(() => {
    upsert.mockReset();
  });

  it('skips upsert when key parts are missing', async () => {
    await storeProductCropMatch(null, 'Vite', null, {
      isCompatible: true,
      confidence: 80,
      reason: 'x',
      matchedCrops: [],
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts with normalized key + rounded confidence', async () => {
    upsert.mockResolvedValueOnce({});

    await storeProductCropMatch(
      '013581',
      'VITE',
      ' Sangiovese ',
      {
        isCompatible: true,
        confidence: 92.7,
        reason: 'Direct match',
        matchedCrops: ['vite'],
      },
      'gpt-4o-mini',
    );

    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0][0];
    expect(args.where.registrationNumber_cropNameNorm_varietyNorm).toEqual({
      registrationNumber: '013581',
      cropNameNorm: 'vite',
      varietyNorm: 'sangiovese',
    });
    expect(args.create.confidence).toBe(93);
    expect(args.update.confidence).toBe(93);
    expect(args.create.model).toBe('gpt-4o-mini');
  });

  it('swallows DB errors silently', async () => {
    upsert.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      storeProductCropMatch('013581', 'Vite', null, {
        isCompatible: false,
        confidence: 10,
        reason: 'no match',
        matchedCrops: [],
      }),
    ).resolves.toBeUndefined();
  });
});
