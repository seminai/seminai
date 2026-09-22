import AdmZip from 'adm-zip';
import {
  detectCsvExcelType,
  detectPdfType,
  detectZipType,
} from '../infrastructure/services/agents/dosage_agent_react/tools/file-type-detector';

describe('file-type-detector', () => {
  it('detects agricultural csv via generic headers', () => {
    const csv = Buffer.from('Foglio;Particella;Comune\n12;55;Ravenna', 'utf-8');
    const result = detectCsvExcelType(csv);
    expect(result.type).toBe('agricultural');
    expect(['medium', 'high']).toContain(result.confidence);
  });

  it('detects stock csv via warehouse headers', () => {
    const csv = Buffer.from(
      'Nome prodotto;Quantità stock;Numero DDT;Data DDT\nUrea;25;DDT-01;2026-01-31',
      'utf-8',
    );
    const result = detectCsvExcelType(csv);
    expect(result.type).toBe('warehouse_stock');
  });

  it('detects invoice and ddt from pdf text patterns with strong signal', () => {
    const invoice = detectPdfType('FATTURA imponibile totale documento partita iva codice fiscale');
    const ddt = detectPdfType(
      'Documento di trasporto DDT destinazione merce bolla accompagnamento causale',
    );
    expect(invoice.type).toBe('invoice');
    expect(invoice.confidence).toBe('high');
    expect(ddt.type).toBe('ddt');
    expect(ddt.confidence).toBe('high');
  });

  it('returns unknown for weak pdf signals instead of filename-only routing', () => {
    const weak = detectPdfType('testo generico', 'fattura_2024.pdf');
    expect(weak.type).toBe('unknown');
    expect(weak.confidence).toBe('low');
  });

  it('detects shapefile zip by .shp + .dbf presence', () => {
    const zip = new AdmZip();
    zip.addFile('sample.shp', Buffer.from('shape-data'));
    zip.addFile('sample.dbf', Buffer.from('dbf-data'));
    const result = detectZipType(zip.toBuffer());
    expect(result.type).toBe('shapefile');
    expect(result.confidence).toBe('high');
  });
});
