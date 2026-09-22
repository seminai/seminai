import {
  normalizeTablesFromMarkdown,
  parseNumber,
} from '../../infrastructure/services/extraction/table-normalizer';

describe('parseNumber', () => {
  it('parses Italian decimal commas', () => {
    expect(parseNumber('1,50')).toBe(1.5);
    expect(parseNumber('1.234,56')).toBeCloseTo(1234.56);
    expect(parseNumber('  € 42,00 ')).toBe(42);
  });
  it('treats bare comma as Italian decimal (NOT US thousand separator)', () => {
    // In the Italian invoice/DDT domain, "1,234" means 1.234 (one-point-two-three-four),
    // not 1234. The parser is intentionally locale-aware for the Italian dataset.
    expect(parseNumber('1,234')).toBeCloseTo(1.234);
    expect(parseNumber('42')).toBe(42);
    // Thousand separator in Italian is the dot: "1.234" should yield 1234.
    expect(parseNumber('1.234')).toBe(1234);
  });
  it('returns null for empty or invalid input', () => {
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber('-')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('normalizeTablesFromMarkdown', () => {
  it('parses a standard Italian invoice markdown table', () => {
    const markdown = [
      '| Codice | Descrizione | Qta | UM | Prezzo | Totale |',
      '| --- | --- | --- | --- | --- | --- |',
      '| XSER030S | SERCADIS SC 1 L | 4 | PZ | 120,00 | 480,00 |',
      '| KSE0820 | ZYPAR LT.1 | 2 | LT | 58,50 | 117,00 |',
    ].join('\n');
    const { tables } = normalizeTablesFromMarkdown(markdown);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toHaveLength(2);
    expect(tables[0].rows[0]).toMatchObject({
      productName: 'SERCADIS SC 1 L',
      productCode: 'XSER030S',
      quantity: 4,
      quantityUnitOfMeasure: 'PZ',
      unitPrice: 120,
      totalPrice: 480,
    });
    expect(tables[0].rows[1]).toMatchObject({
      productName: 'ZYPAR LT.1',
      quantity: 2,
      quantityUnitOfMeasure: 'LT',
      unitPrice: 58.5,
      totalPrice: 117,
    });
  });

  it('resolves columns regardless of their order (qta after UM, prezzo-totale swapped)', () => {
    const markdown = [
      '| Descrizione | UM | Qta | Totale | Prezzo |',
      '| --- | --- | --- | --- | --- |',
      '| CONCIME AMMONIO 25 KG | SC | 10 | 450,00 | 45,00 |',
    ].join('\n');
    const { tables } = normalizeTablesFromMarkdown(markdown);
    expect(tables[0].rows[0]).toMatchObject({
      productName: 'CONCIME AMMONIO 25 KG',
      quantity: 10,
      quantityUnitOfMeasure: 'SC',
      unitPrice: 45,
      totalPrice: 450,
    });
  });

  it('keeps non-table markdown as surroundingText', () => {
    const markdown = [
      'FATTURA FT 1/155 del 28/02/2025',
      'Fornitore: ALBAVERDE S.N.C.',
      '',
      '| Descrizione | Qta | UM |',
      '| --- | --- | --- |',
      '| Prodotto A | 1 | PZ |',
      '',
      'Totale imponibile: 100,00',
    ].join('\n');
    const { tables, surroundingText } = normalizeTablesFromMarkdown(markdown);
    expect(tables).toHaveLength(1);
    expect(surroundingText).toContain('FT 1/155');
    expect(surroundingText).toContain('Fornitore');
    expect(surroundingText).toContain('Totale imponibile');
  });

  it('ignores tables without product/quantity columns', () => {
    const markdown = [
      '| Col A | Col B | Col C |',
      '| --- | --- | --- |',
      '| foo | bar | baz |',
    ].join('\n');
    const { tables, surroundingText } = normalizeTablesFromMarkdown(markdown);
    expect(tables).toHaveLength(0);
    expect(surroundingText).toContain('| Col A');
  });

  it('drops "Rif DT n.XXX del DD/MM/YY" rows even when OCR has filled them with values', () => {
    // Real failure case from "synthetic-invoice.pdf": Mistral OCR placed the
    // visual section divider "Rif DT n.763 del 01/03/25" in the descrizione
    // cell of what would otherwise be SERCADIS's value row. Without this
    // filter the structured rows include 4 entries (1 phantom + 3 real),
    // shifting downstream productName assignment by one position.
    const markdown = [
      '| Cod.Art | Descrizione | UM | Quantità | Prezzo | Importo |',
      '| --- | --- | --- | --- | --- | --- |',
      '| XSER03BS | Rif DT n.763 del 01/03/25 | LT | 4 | 150,00 | 600,00 |',
      '| XSCH01 | SERCADIS SC LT.1-clp | NR | 9 | 33,00 | 297,00 |',
      '| XFOR02 | SCHERMO 0.5G KG.10-clp | NR | 15 | 82,00 | 1.230,00 |',
    ].join('\n');
    const { tables } = normalizeTablesFromMarkdown(markdown);
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toHaveLength(2);
    expect(tables[0].rows.map((row) => row.productName)).toEqual([
      'SERCADIS SC LT.1-clp',
      'SCHERMO 0.5G KG.10-clp',
    ]);
  });

  it('keeps rows whose descrizione contains both a Rif DT marker and a real product', () => {
    const markdown = [
      '| Cod.Art | Descrizione | UM | Quantità | Prezzo | Importo |',
      '| --- | --- | --- | --- | --- | --- |',
      '| XCON50FOP | Rif DT n.1872 del 04/04/25 CONC.ACTIVE LAND PLUS 10.8.15 saccone KG.600 | NR | 6 | 315,00 | 1.890,00 |',
    ].join('\n');
    const { tables } = normalizeTablesFromMarkdown(markdown);
    expect(tables[0].rows).toHaveLength(1);
    expect(tables[0].rows[0].productName).toContain('CONC.ACTIVE LAND PLUS');
    expect(tables[0].rows[0].quantity).toBe(6);
    expect(tables[0].rows[0].unitPrice).toBe(315);
    expect(tables[0].rows[0].totalPrice).toBe(1890);
  });
});
