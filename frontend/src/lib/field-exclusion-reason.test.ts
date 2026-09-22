import { describe, expect, it } from 'vitest';
import { getFieldExclusionReason } from './field-exclusion-reason';

const REFERENCE_YEAR = 2026;

describe('getFieldExclusionReason', () => {
  it('flags fields without any surface data', () => {
    expect(
      getFieldExclusionReason(
        { sauHa: null, gisHa: null, superficieCatastaleMq: null },
        { start: '2026-01-01', end: '2026-12-31' },
        REFERENCE_YEAR,
      ),
    ).toBe('no-surface');
  });

  it('flags undated fields as period-mismatch for a next-year range (current-year default)', () => {
    expect(
      getFieldExclusionReason(
        { superficieCatastaleMq: 12000 },
        { start: '2027-03-01', end: '2027-10-31' },
        REFERENCE_YEAR,
      ),
    ).toBe('period-mismatch');
  });

  it('flags explicit conduction periods that do not overlap the range', () => {
    expect(
      getFieldExclusionReason(
        {
          sauHa: 2,
          inizioConduzione: '2025-01-01',
          fineConduzione: '2025-12-31',
        },
        { start: '2026-01-01', end: '2026-12-31' },
        REFERENCE_YEAR,
      ),
    ).toBe('period-mismatch');
  });

  it('falls back to fully-allocated when surface and period are fine', () => {
    expect(
      getFieldExclusionReason(
        {
          sauHa: 2,
          inizioConduzione: '2026-01-01',
          fineConduzione: '2026-12-31',
        },
        { start: '2026-03-01', end: '2026-10-31' },
        REFERENCE_YEAR,
      ),
    ).toBe('fully-allocated');
  });

  it('uses surface fallbacks in the backend order (sauHa → gisHa → catastale)', () => {
    expect(
      getFieldExclusionReason(
        { gisHa: 1.5 },
        { start: '2027-01-01', end: '2027-12-31' },
        REFERENCE_YEAR,
      ),
    ).toBe('period-mismatch');
  });
});
