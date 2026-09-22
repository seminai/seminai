import { describe, expect, it } from '@jest/globals';
import { parseRegistrationNumber } from '../infrastructure/services/utils/parse-registration-number';

describe('parseRegistrationNumber', () => {
  it('extracts registration from "Reg. n. <number> del <date>"', () => {
    const result = parseRegistrationNumber('Reg. n. 012345 del 12/09/1972');
    expect(result).toBe('12345');
  });

  it('extracts registration from presidio labels', () => {
    const result = parseRegistrationNumber('Presidio n. 08184');
    expect(result).toBe('8184');
  });

  it('extracts registration from "Reg. nr." format', () => {
    const result = parseRegistrationNumber('Reg. nr. 11243 del 15.03.2002');
    expect(result).toBe('11243');
  });

  it('normalizes plain numeric registration values', () => {
    const result = parseRegistrationNumber('000683');
    expect(result).toBe('683');
  });

  it('returns null for empty values', () => {
    const result = parseRegistrationNumber(null);
    expect(result).toBeNull();
  });
});
