import { describe, expect, it } from 'vitest';
import {
  buildManufacturingCategoryOptions,
  isKnownAgriculturalCategory,
  isKnownManufacturingEnum,
  normalizeProductCategoryValue,
} from '@/lib/extraction-product-category';

describe('buildManufacturingCategoryOptions', () => {
  it('includes enum options and distinct custom product types', () => {
    const options = buildManufacturingCategoryOptions([
      { type: 'Lamiera', category: 'OTHER' },
      { type: 'Lamiera', category: 'OTHER' },
      { type: 'Componente', category: 'OTHER' },
      { type: 'Generico', category: 'OTHER' },
    ]);

    expect(options.map((option) => option.value)).toEqual([
      'EQUIPMENT',
      'PACKAGING',
      'OTHER',
      'Componente',
      'Lamiera',
    ]);
  });
});

describe('normalizeProductCategoryValue', () => {
  it('preserves custom manufacturing types', () => {
    expect(normalizeProductCategoryValue('Lamiera', true)).toBe('Lamiera');
  });

  it('falls back to OTHER for unknown agricultural values', () => {
    expect(normalizeProductCategoryValue('Lamiera', false)).toBe('OTHER');
  });

  it('keeps known agricultural categories', () => {
    expect(normalizeProductCategoryValue('PHYTOSANITARY', false)).toBe('PHYTOSANITARY');
    expect(isKnownAgriculturalCategory('FERTILIZER')).toBe(true);
    expect(isKnownManufacturingEnum('EQUIPMENT')).toBe(true);
  });
});
