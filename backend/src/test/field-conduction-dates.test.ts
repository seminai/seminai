import { resolveFieldConductionDates } from '../infrastructure/utils/field-conduction-dates';

describe('resolveFieldConductionDates', () => {
  it('keeps both dates when both are provided', () => {
    const result = resolveFieldConductionDates('2025-03-01', '2025-09-30');
    expect(result.inizioConduzione.toISOString().slice(0, 10)).toBe('2025-03-01');
    expect(result.fineConduzione.toISOString().slice(0, 10)).toBe('2025-09-30');
  });

  it('defaults both dates to the full reference year when both are missing', () => {
    const result = resolveFieldConductionDates(null, undefined, 2025);
    expect(result.inizioConduzione).toEqual(new Date(2025, 0, 1));
    expect(result.fineConduzione).toEqual(new Date(2025, 11, 31));
  });

  it('defaults only the missing boundary when one date is provided', () => {
    const result = resolveFieldConductionDates('2025-04-15', null, 2025);
    expect(result.inizioConduzione.toISOString().slice(0, 10)).toBe('2025-04-15');
    expect(result.fineConduzione).toEqual(new Date(2025, 11, 31));
  });

  it('falls back to the default when the provided value is not a valid date', () => {
    const result = resolveFieldConductionDates('not-a-date', undefined, 2025);
    expect(result.inizioConduzione).toEqual(new Date(2025, 0, 1));
  });
});
