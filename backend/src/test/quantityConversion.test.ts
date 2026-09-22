import { describe, it, expect } from '@jest/globals';
import { convertQuantityToCanonicalUnit } from '../infrastructure/utils/quantityConversion';

describe('convertQuantityToCanonicalUnit', () => {
  describe('null/empty inputs', () => {
    it('returns null when quantity is null', () => {
      expect(convertQuantityToCanonicalUnit(null, 'kg')).toBeNull();
    });

    it('returns null when unitOfMeasure is null', () => {
      expect(convertQuantityToCanonicalUnit(10, null)).toBeNull();
    });

    it('returns null when unitOfMeasure is empty string', () => {
      expect(convertQuantityToCanonicalUnit(10, '')).toBeNull();
    });

    it('returns null when unitOfMeasure is whitespace only', () => {
      expect(convertQuantityToCanonicalUnit(10, '   ')).toBeNull();
    });
  });

  describe('weight to kg', () => {
    it('keeps kg as kg', () => {
      const result = convertQuantityToCanonicalUnit(50, 'kg');
      expect(result).toEqual({ quantityConverted: 50, unitMeasureConverted: 'kg' });
    });

    it('converts tn (tonnellate) to kg', () => {
      const result = convertQuantityToCanonicalUnit(2, 'tn');
      expect(result).toEqual({ quantityConverted: 2000, unitMeasureConverted: 'kg' });
    });

    it('converts ton to kg', () => {
      const result = convertQuantityToCanonicalUnit(1.5, 'ton');
      expect(result).toEqual({ quantityConverted: 1500, unitMeasureConverted: 'kg' });
    });

    it('converts TM to kg (case insensitive)', () => {
      const result = convertQuantityToCanonicalUnit(1, 'TM');
      expect(result).toEqual({ quantityConverted: 1000, unitMeasureConverted: 'kg' });
    });

    it('converts quintali to kg', () => {
      const result = convertQuantityToCanonicalUnit(3, 'quintali');
      expect(result).toEqual({ quantityConverted: 300, unitMeasureConverted: 'kg' });
    });

    it('converts q to kg', () => {
      const result = convertQuantityToCanonicalUnit(5, 'q');
      expect(result).toEqual({ quantityConverted: 500, unitMeasureConverted: 'kg' });
    });

    it('converts Q.LE to kg', () => {
      const result = convertQuantityToCanonicalUnit(2, 'Q.LE');
      expect(result).toEqual({ quantityConverted: 200, unitMeasureConverted: 'kg' });
    });

    it('converts g to kg', () => {
      const result = convertQuantityToCanonicalUnit(500, 'g');
      expect(result).toEqual({ quantityConverted: 0.5, unitMeasureConverted: 'kg' });
    });

    it('converts gr to kg', () => {
      const result = convertQuantityToCanonicalUnit(1000, 'gr');
      expect(result).toEqual({ quantityConverted: 1, unitMeasureConverted: 'kg' });
    });
  });

  describe('volume to L', () => {
    it('keeps L as L', () => {
      const result = convertQuantityToCanonicalUnit(100, 'L');
      expect(result).toEqual({ quantityConverted: 100, unitMeasureConverted: 'L' });
    });

    it('converts lt to L', () => {
      const result = convertQuantityToCanonicalUnit(50, 'lt');
      expect(result).toEqual({ quantityConverted: 50, unitMeasureConverted: 'L' });
    });

    it('converts litri to L', () => {
      const result = convertQuantityToCanonicalUnit(20, 'litri');
      expect(result).toEqual({ quantityConverted: 20, unitMeasureConverted: 'L' });
    });

    it('converts ml to L', () => {
      const result = convertQuantityToCanonicalUnit(2500, 'ml');
      expect(result).toEqual({ quantityConverted: 2.5, unitMeasureConverted: 'L' });
    });
  });

  describe('unknown unit', () => {
    it('returns same quantity and unit when unit is not recognized', () => {
      const result = convertQuantityToCanonicalUnit(10, 'PZ');
      expect(result).toEqual({ quantityConverted: 10, unitMeasureConverted: 'PZ' });
    });

    it('trims unit when passing through', () => {
      const result = convertQuantityToCanonicalUnit(1, '  SCATOLA  ');
      expect(result).toEqual({ quantityConverted: 1, unitMeasureConverted: 'SCATOLA' });
    });
  });
});
