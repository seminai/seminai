import { describe, it, expect } from '@jest/globals';
import { parsePackagingFromDescription } from '../infrastructure/utils/parsePackagingFromDescription';

describe('parsePackagingFromDescription', () => {
  describe('null/empty inputs', () => {
    it('returns null for null', () => {
      expect(parsePackagingFromDescription(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parsePackagingFromDescription(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parsePackagingFromDescription('')).toBeNull();
    });

    it('returns null when no unit token is present', () => {
      expect(parsePackagingFromDescription('REXXAR PRODOTTO XYZ 2024')).toBeNull();
    });
  });

  describe('volume descriptors', () => {
    it('parses unit-first "DA ML 300"', () => {
      expect(parsePackagingFromDescription('REXXAR DA ML 300')).toEqual({
        value: 300,
        unit: 'ML',
      });
    });

    it('parses value-first "300 ML"', () => {
      expect(parsePackagingFromDescription('BOTTLE 300 ML')).toEqual({
        value: 300,
        unit: 'ML',
      });
    });

    it('parses "DA LT 1"', () => {
      expect(parsePackagingFromDescription('PH ONE DA LT 1')).toEqual({
        value: 1,
        unit: 'L',
      });
    });

    it('parses "LT 5"', () => {
      expect(parsePackagingFromDescription('TAIFUN MK CL DA LT 5')).toEqual({
        value: 5,
        unit: 'L',
      });
    });

    it('parses "1 L"', () => {
      expect(parsePackagingFromDescription('SERCADIS SC 1 L')).toEqual({
        value: 1,
        unit: 'L',
      });
    });

    it('parses decimal with comma "0,5 L"', () => {
      expect(parsePackagingFromDescription('PRODOTTO 0,5 L')).toEqual({
        value: 0.5,
        unit: 'L',
      });
    });

    it('parses decimal with dot "0.5 L"', () => {
      expect(parsePackagingFromDescription('PRODOTTO 0.5 L')).toEqual({
        value: 0.5,
        unit: 'L',
      });
    });
  });

  describe('weight descriptors', () => {
    it('parses "25 KG"', () => {
      expect(parsePackagingFromDescription('CONCIME AMMONIO 25 KG')).toEqual({
        value: 25,
        unit: 'KG',
      });
    });

    it('parses "500 G"', () => {
      expect(parsePackagingFromDescription('SACCO 500 G')).toEqual({
        value: 500,
        unit: 'G',
      });
    });

    it('parses "500 GR" alias', () => {
      expect(parsePackagingFromDescription('PRODOTTO 500 GR')).toEqual({
        value: 500,
        unit: 'G',
      });
    });

    it('parses italian "GRAMMI"', () => {
      expect(parsePackagingFromDescription('PRODOTTO 250 GRAMMI')).toEqual({
        value: 250,
        unit: 'G',
      });
    });
  });

  describe('ambiguity guard', () => {
    it('returns null when two distinct descriptors are present', () => {
      expect(parsePackagingFromDescription('CONCIME 25 KG SACCO 50 KG')).toBeNull();
    });

    it('returns null when mixing volume and weight', () => {
      expect(parsePackagingFromDescription('MIX 2 L AND 5 KG')).toBeNull();
    });

    it('accepts repeated identical descriptors', () => {
      expect(parsePackagingFromDescription('PROD ML 300 DA ML 300')).toEqual({
        value: 300,
        unit: 'ML',
      });
    });

    it('ignores stray numbers without unit', () => {
      expect(parsePackagingFromDescription('PRODOTTO 2024 DA ML 300')).toEqual({
        value: 300,
        unit: 'ML',
      });
    });
  });

  describe('case insensitivity', () => {
    it('parses lowercase units', () => {
      expect(parsePackagingFromDescription('rexxar da ml 300')).toEqual({
        value: 300,
        unit: 'ML',
      });
    });

    it('parses mixed case', () => {
      expect(parsePackagingFromDescription('Sercadis Sc 1 Lt')).toEqual({
        value: 1,
        unit: 'L',
      });
    });
  });

  describe('boundary safety', () => {
    it('does not match units inside longer words', () => {
      expect(parsePackagingFromDescription('PROGRAMMA 5')).toBeNull();
    });

    it('rejects zero or negative values', () => {
      expect(parsePackagingFromDescription('PRODOTTO 0 KG')).toBeNull();
    });
  });
});
