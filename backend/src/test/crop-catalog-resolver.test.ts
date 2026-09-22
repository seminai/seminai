import {
  applyExactCatalogFallback,
  exactCatalogMatch,
  isUnresolvedCropName,
} from '../infrastructure/services/extraction/crop-catalog-resolver';
import type { CropCatalogEntry } from '../infrastructure/services/extraction/production-unit-normalizer';

const catalog: CropCatalogEntry[] = [
  {
    code: 'BRASS_NAP',
    species: 'Brassica napus',
    cropType: 'colza',
  },
  {
    code: 'MALUS_DOM',
    species: 'Malus domestica',
    cropType: 'melo',
  },
  {
    code: 'CUCUM_MELO',
    species: 'Cucumis melo',
    cropType: 'melone',
  },
];

describe('crop-catalog-resolver', () => {
  it('exactCatalogMatch resolves COLZA without substring false positives', () => {
    const match = exactCatalogMatch('COLZA', catalog);
    expect(match?.species).toBe('Brassica napus');
    expect(exactCatalogMatch('MELO', catalog)?.species).toBe('Malus domestica');
    expect(exactCatalogMatch('MELONE', catalog)?.species).toBe('Cucumis melo');
    expect(exactCatalogMatch('MELO', catalog)?.species).not.toBe('Cucumis melo');
  });

  it('does not substring-match melone when searching melo label', () => {
    expect(exactCatalogMatch('MELO', catalog)?.cropType).toBe('melo');
    expect(exactCatalogMatch('MELO', catalog)?.cropType).not.toBe('melone');
  });

  it('applyExactCatalogFallback returns species and code', () => {
    const fallback = applyExactCatalogFallback('colza', catalog);
    expect(fallback).toEqual({ species: 'Brassica napus', code: 'BRASS_NAP' });
  });

  it('isUnresolvedCropName skips resolved Latin binomial', () => {
    expect(isUnresolvedCropName('Brassica napus', catalog)).toBe(false);
    expect(isUnresolvedCropName('COLZA', catalog)).toBe(true);
  });
});
