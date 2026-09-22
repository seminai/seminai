import { describe, expect, it } from '@jest/globals';
import { parsePcgCropLabel } from '../infrastructure/services/pcg-geojson-utils';

describe('parsePcgCropLabel', () => {
  it('splits hierarchical PCG labels on hyphen without surrounding spaces', () => {
    const actual = parsePcgCropLabel('FORAGGIO-PRATO POLIFITA', 'FG-32');
    expect(actual).toEqual({
      cropType: 'FG',
      cropName: 'PRATO POLIFITA',
      uso: 'FORAGGIO-PRATO POLIFITA',
    });
  });

  it('strips metadata suffix before deriving cropName', () => {
    const coltura = 'foraggio prato polifita non avvicendato per 5 anni - permanente';
    const actual = parsePcgCropLabel(coltura, 'FG-32');
    expect(actual.uso).toBe(coltura);
    expect(actual.cropName).toBe('foraggio prato polifita non avvicendato per 5 anni');
  });

  it('keeps the full label as cropName when no hierarchical hyphen is present', () => {
    const coltura = 'MAIS da granella';
    const actual = parsePcgCropLabel(coltura, 'MA-01');
    expect(actual).toEqual({
      cropType: 'MA',
      cropName: 'MAIS da granella',
      uso: 'MAIS da granella',
    });
  });
});
