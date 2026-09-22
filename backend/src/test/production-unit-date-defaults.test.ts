import { resolvePuDateOrDefault } from '../infrastructure/utils/production-unit-date-defaults';

describe('resolvePuDateOrDefault', () => {
  it('returns the parsed value when provided', () => {
    const result = resolvePuDateOrDefault('2025-06-15', 'start', 2025);
    expect(result.toISOString().slice(0, 10)).toBe('2025-06-15');
  });

  it('defaults to January 1st of the reference year for the start boundary', () => {
    expect(resolvePuDateOrDefault(null, 'start', 2025)).toEqual(new Date(2025, 0, 1));
  });

  it('defaults to December 31st of the reference year for the end boundary', () => {
    expect(resolvePuDateOrDefault(undefined, 'end', 2025)).toEqual(new Date(2025, 11, 31));
  });

  it('falls back to the boundary default when the value is not a valid date', () => {
    expect(resolvePuDateOrDefault('invalid', 'end', 2025)).toEqual(new Date(2025, 11, 31));
  });
});
