import { mapPdfExtractionRoute } from '../infrastructure/services/extraction/pdf-extraction-router';

describe('pdf-extraction-router', () => {
  it('routes invoice to commercial pipeline', () => {
    const routing = mapPdfExtractionRoute({
      category: 'invoice',
      fileFormat: 'pdf',
      isAsync: false,
      detection: { type: 'invoice', confidence: 'high', reason: 'test' },
    });
    expect(routing.route).toBe('commercial');
    expect(routing.detectedFileType).toBe('invoice');
    expect(routing.documentCategory).toBe('FATTURA');
  });

  it('routes agricultural pdf with piano marker to piano colturale', () => {
    const routing = mapPdfExtractionRoute({
      category: 'agricultural',
      fileFormat: 'pdf',
      isAsync: true,
      detection: { type: 'piano_colturale', confidence: 'high', reason: 'agrea' },
    });
    expect(routing.route).toBe('piano_colturale');
    expect(routing.documentCategory).toBe('PIANO_COLTURALE');
  });

  it('routes ddt to commercial with DDT category', () => {
    const routing = mapPdfExtractionRoute({
      category: 'ddt',
      fileFormat: 'pdf',
      isAsync: false,
    });
    expect(routing.route).toBe('commercial');
    expect(routing.documentCategory).toBe('DDT');
  });
});
