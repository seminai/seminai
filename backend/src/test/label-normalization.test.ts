import { describe, expect, it } from '@jest/globals';
import {
  buildRegistrationNumberVariants,
  normalizeLabelProductName,
  normalizeLabelRegistrationNumber,
} from '../domain/utils/labelNormalization';

describe('label normalization', () => {
  it('normalizes product names for aliases', () => {
    const result = normalizeLabelProductName('  Captano   80   WDG  ');
    expect(result).toBe('captano 80 wdg');
  });

  it('normalizes registration numbers to a canonical ministerial key', () => {
    expect(normalizeLabelRegistrationNumber('Reg. n. 001234')).toBe('1234');
    expect(normalizeLabelRegistrationNumber('0000')).toBeNull();
    expect(normalizeLabelRegistrationNumber('')).toBeNull();
  });

  it('builds legacy registration variants for lookup compatibility', () => {
    const result = buildRegistrationNumberVariants('001234');
    expect(result).toEqual(['001234', '1234', '01234']);
  });
});
