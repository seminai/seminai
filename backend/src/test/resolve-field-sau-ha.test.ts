import { resolveFieldSauHa } from '../infrastructure/utils/resolve-field-sau-ha';

describe('resolveFieldSauHa', () => {
  it('returns sauHa when provided and positive', () => {
    expect(resolveFieldSauHa(3.5, 4, 50000)).toBe(3.5);
  });

  it('falls back to gisHa when sauHa is missing', () => {
    expect(resolveFieldSauHa(null, 2.5, 50000)).toBe(2.5);
  });

  it('falls back to superficieCatastaleMq converted to hectares when sauHa and gisHa are missing', () => {
    expect(resolveFieldSauHa(null, null, 10000)).toBe(1);
  });

  it('returns null when no area source is available', () => {
    expect(resolveFieldSauHa(null, null, null)).toBeNull();
  });

  it('ignores non-positive values and continues the fallback chain', () => {
    expect(resolveFieldSauHa(0, 0, 20000)).toBe(2);
  });
});
