import { normalizeVat, isValidItalianVat } from '../domain/utils/vat';

describe('normalizeVat', () => {
  it('strips the IT prefix, spaces and dots', () => {
    expect(normalizeVat('IT 012.345.678 90')).toBe('01234567890');
  });

  it('keeps an already-bare 11-digit VAT', () => {
    expect(normalizeVat('09876543210')).toBe('09876543210');
  });

  it('returns null for empty/nullish input', () => {
    expect(normalizeVat('')).toBeNull();
    expect(normalizeVat(null)).toBeNull();
    expect(normalizeVat(undefined)).toBeNull();
  });
});

describe('isValidItalianVat', () => {
  it('accepts a normalized 11-digit VAT (with or without IT prefix)', () => {
    expect(isValidItalianVat('IT01234567890')).toBe(true);
    expect(isValidItalianVat('01234567890')).toBe(true);
  });

  it('rejects wrong length or non-numeric', () => {
    expect(isValidItalianVat('1234567890')).toBe(false); // 10 digits
    expect(isValidItalianVat('ABCDEFGHIJK')).toBe(false);
    expect(isValidItalianVat(null)).toBe(false);
  });
});
