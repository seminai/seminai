import { normalizeAreaHa } from '../infrastructure/utils/area-normalization';

describe('normalizeAreaHa', () => {
  it('keeps hectare-sized values unchanged', () => {
    expect(normalizeAreaHa(2.9796)).toBe(2.9796);
    expect(normalizeAreaHa('2,9796')).toBe(2.9796);
  });

  it('converts likely square-meter values to hectares', () => {
    expect(normalizeAreaHa(29796)).toBe(2.9796);
    expect(normalizeAreaHa('29.796')).toBe(2.9796);
  });

  it('uses cadastral square-meter references to disambiguate allocations', () => {
    expect(normalizeAreaHa(29796, { referenceAreaSqm: 29796 })).toBe(2.9796);
  });
});
