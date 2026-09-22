import { InvoiceDeterministicFallbackParser } from '../../infrastructure/services/tool/invoice-deterministic-fallback-parser';
import { DdtDeterministicFallbackParser } from '../../infrastructure/services/tool/ddt-deterministic-fallback-parser';

describe('InvoiceDeterministicFallbackParser', () => {
  it('extracts rows from a markdown table and parses invoice metadata', () => {
    const markdown = [
      'Azienda: ALB - ALBAVERDE S.N.C.',
      '',
      '| FT 1/155 28/02/25 | 501.03806 - AZ.AGR.GIORGI ADA |',
      '| --- | --- |',
      '',
      '| Codice | Descrizione | Qta | UM | Prezzo | Totale |',
      '| --- | --- | --- | --- | --- | --- |',
      '| C02460 | CONC. NITR.AMM. 27% + CaO 11,6% da kg. 600 GRANULARE | 1,800 | TM | 350,00 | 630,00 |',
      '| SE2714 | LOIETTO ITALICO MIURA da kg. 25 | 350 | KG | 2,10 | 735,00 |',
    ].join('\n');
    const parser = new InvoiceDeterministicFallbackParser();
    const entries = parser.execute({ text: markdown });
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0]).toMatchObject({
      productName: expect.stringContaining('CONC. NITR.AMM. 27%'),
      quantity: 1.8,
      quantityUnitOfMeasure: 'TM',
      unitPrice: 350,
      totalPrice: 630,
    });
    expect(entries[1]).toMatchObject({
      productName: expect.stringContaining('LOIETTO ITALICO MIURA'),
      quantity: 350,
      quantityUnitOfMeasure: 'KG',
      unitPrice: 2.1,
      totalPrice: 735,
    });
  });

  it('handles rearranged column orders', () => {
    const markdown = [
      '| Descrizione | UM | Prezzo | Qta | Totale |',
      '| --- | --- | --- | --- | --- |',
      '| SERCADIS SC 1 L | PZ | 120,00 | 4 | 480,00 |',
    ].join('\n');
    const parser = new InvoiceDeterministicFallbackParser();
    const entries = parser.execute({ text: markdown });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      productName: 'SERCADIS SC 1 L',
      quantity: 4,
      quantityUnitOfMeasure: 'PZ',
      unitPrice: 120,
      totalPrice: 480,
    });
  });
});

describe('DdtDeterministicFallbackParser', () => {
  it('extracts rows and DDT metadata', () => {
    const markdown = [
      'Azienda: ALB - ALBAVERDE S.N.C.',
      'Data DDT: 12/03/2025',
      'N. ordine: ORD-2025/0042',
      '',
      '| Codice | Descrizione | Qta | UM |',
      '| --- | --- | --- | --- |',
      '| XSER030S | SERCADIS SC 1 L | 4 | PZ |',
      '| KSE0820 | ZYPAR LT.1 | 2 | LT |',
    ].join('\n');
    const parser = new DdtDeterministicFallbackParser();
    const entries = parser.execute({ text: markdown });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      productName: 'SERCADIS SC 1 L',
      quantity: 4,
      quantityUnitOfMeasure: 'PZ',
      ddtDate: '2025-03-12',
      orderNumber: 'ORD-2025/0042',
    });
  });
});
