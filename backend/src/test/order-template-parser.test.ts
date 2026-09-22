import * as XLSX from 'xlsx';
import { parseOrderTemplate } from '../application/use-cases/sales-order/parse-order-template';

function buildTemplateBuffer(rows: ReadonlyArray<ReadonlyArray<string | number>>): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows as (string | number)[][]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ordine');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const WINE_TEMPLATE: ReadonlyArray<ReadonlyArray<string | number>> = [
  ['Nome cliente', 'Azienda Rossi S.r.l.'],
  ['P.IVA', 'IT01234567890'],
  ['Note di consegna', 'Consegna entro venerdì'],
  [],
  ['Prodotto', 'Annata', 'Quantità', 'Prezzo unitario'],
  ['Amarone della Valpolicella', 2018, 12, '15,5'],
  ['', '', '', ''],
  ['Soave', '', 0, ''],
];

describe('parseOrderTemplate', () => {
  it('parses the customer block and a wine line with IT decimal price', () => {
    const inputBuffer = buildTemplateBuffer(WINE_TEMPLATE);

    const actual = parseOrderTemplate({ fileBuffer: inputBuffer, fileName: 'ordine.xlsx' });

    expect(actual.customerName).toBe('Azienda Rossi S.r.l.');
    expect(actual.customerVat).toBe('IT01234567890');
    expect(actual.deliveryNotesText).toBe('Consegna entro venerdì');
    expect(actual.sourceChannel).toBe('template');
    expect(actual.lines).toHaveLength(1); // blank + zero-qty rows dropped
    expect(actual.lines[0]).toEqual({
      productName: 'Amarone della Valpolicella',
      quantity: 12,
      vintage: 2018,
      unitPrice: 15.5,
    });
  });

  it('honours an explicit sourceChannel', () => {
    const inputBuffer = buildTemplateBuffer(WINE_TEMPLATE);
    const actual = parseOrderTemplate({
      fileBuffer: inputBuffer,
      fileName: 'o.xlsx',
      sourceChannel: 'email',
    });
    expect(actual.sourceChannel).toBe('email');
  });

  it('rejects a non-spreadsheet file', () => {
    expect(() =>
      parseOrderTemplate({ fileBuffer: Buffer.from('x'), fileName: 'order.pdf' }),
    ).toThrow(/UNSUPPORTED_FILE_TYPE|supported/);
  });

  it('rejects a template without valid lines', () => {
    const empty = buildTemplateBuffer([
      ['Nome cliente', 'Solo Cliente'],
      [],
      ['Prodotto', 'Annata', 'Quantità', 'Prezzo unitario'],
    ]);
    expect(() => parseOrderTemplate({ fileBuffer: empty, fileName: 'o.xlsx' })).toThrow(
      /EMPTY_ORDER_TEMPLATE|no valid lines/,
    );
  });
});
