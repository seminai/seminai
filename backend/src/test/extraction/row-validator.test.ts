import {
  canonicalizeUnit,
  validateRowCoherence,
} from '../../infrastructure/services/extraction/row-validator';

describe('canonicalizeUnit', () => {
  it.each([
    ['KG', 'KG'],
    ['kg', 'KG'],
    ['kg.', 'KG'],
    ['LT', 'LT'],
    ['Lt.', 'LT'],
    ['Litri', 'L'],
    ['Quintali', 'Q'],
    ['Tonnellate', 'T'],
    ['PZ', 'PZ'],
    ['Pezzi', 'PZ'],
    ['CONF', 'CF'],
  ])('canonicalizes %s → %s', (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
  it('returns null for unknown units', () => {
    expect(canonicalizeUnit('XYZ')).toBeNull();
    expect(canonicalizeUnit('')).toBeNull();
    expect(canonicalizeUnit(null)).toBeNull();
  });
});

describe('validateRowCoherence', () => {
  it('passes for a coherent row', () => {
    const verdict = validateRowCoherence({
      quantity: 10,
      quantityUnitOfMeasure: 'KG',
      unitPrice: 5,
      totalPrice: 50,
    });
    expect(verdict.needsReview).toBe(false);
    expect(verdict.reasons).toEqual([]);
  });

  it('flags unknown unit of measure', () => {
    const verdict = validateRowCoherence({
      quantity: 10,
      quantityUnitOfMeasure: 'XYZ',
      unitPrice: 5,
      totalPrice: 50,
    });
    expect(verdict.needsReview).toBe(true);
    expect(verdict.reasons.some((r) => r.includes('Unknown unit'))).toBe(true);
  });

  it('flags non-positive quantity', () => {
    const verdict = validateRowCoherence({
      quantity: 0,
      quantityUnitOfMeasure: 'KG',
      unitPrice: 5,
      totalPrice: 0,
    });
    expect(verdict.needsReview).toBe(true);
    expect(verdict.reasons).toContain('Non-positive quantity');
  });

  it('flags price mismatch', () => {
    const verdict = validateRowCoherence({
      quantity: 10,
      quantityUnitOfMeasure: 'KG',
      unitPrice: 5,
      totalPrice: 999,
    });
    expect(verdict.needsReview).toBe(true);
    expect(verdict.reasons.some((r) => r.includes('Price mismatch'))).toBe(true);
  });

  it('tolerates small rounding differences on total price', () => {
    const verdict = validateRowCoherence({
      quantity: 3,
      quantityUnitOfMeasure: 'L',
      unitPrice: 10,
      totalPrice: 30.2,
    });
    expect(verdict.needsReview).toBe(false);
  });

  it('flags missing quantity but not a null unit', () => {
    const verdict = validateRowCoherence({
      quantity: null,
      quantityUnitOfMeasure: null,
      unitPrice: null,
      totalPrice: null,
    });
    expect(verdict.needsReview).toBe(true);
    expect(verdict.reasons).toContain('Missing quantity');
  });
});
