import { describe, expect, it } from 'vitest';
import { buildAgriculturalReviewTab } from '@/lib/agricultural-review-tab';

describe('buildAgriculturalReviewTab', () => {
  it('opens agricultural batch uploads in the extraction review screen', () => {
    const actual = buildAgriculturalReviewTab([
      { id: 'stock-1', category: 'stock', fileName: 'magazzino.xlsx' },
      { id: 'agri-1', category: 'agricultural', fileName: 'AZIENDA 2.zip' },
    ]);

    expect(actual).toEqual({
      id: 'extraction-agri-1',
      title: 'AZIENDA 2.zip',
      subtitle: 'Revisione dati agricoli',
      format: '.zip',
      source: 'archivio',
    });
  });

  it('returns null when the batch does not contain agricultural data', () => {
    expect(
      buildAgriculturalReviewTab([
        { id: 'stock-1', category: 'stock', fileName: 'magazzino.xlsx' },
      ]),
    ).toBeNull();
  });
});
