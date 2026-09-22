import { ExtractionDataValidator } from '../../infrastructure/services/extraction/extraction-data-validator';
import { type InvoiceEntry } from '../../domain/dtos/invoice-entry.dto';

describe('ExtractionDataValidator', () => {
  it('accepts invoice extraction data with OCR metadata', () => {
    const inputEntry = createInvoiceEntry({
      sourceRowIndex: 2,
      productCode: 'XSER030S',
      rawLine: 'XSER030S | SERCADIS SC 1 L | 4 | PZ',
      sourceChannel: 'llm-primary',
    });
    const actualData = ExtractionDataValidator.parseForCategory('invoice', {
      entries: [inputEntry],
      extractedCount: 1,
    });
    expect(actualData).toMatchObject({ extractedCount: 1 });
  });

  it('rejects invoice extraction data with invalid typed fields', () => {
    expect(() =>
      ExtractionDataValidator.parseForCategory('invoice', {
        entries: [{ ...createInvoiceEntry(), quantity: '4' }],
        extractedCount: 1,
      }),
    ).toThrow(/quantity/);
  });

  it('validates confirm invoice entries arrays', () => {
    const actualEntries = ExtractionDataValidator.parseConfirmInvoiceEntries([
      createInvoiceEntry(),
    ]);
    expect(actualEntries).toHaveLength(1);
  });

  it('rejects confirm invoice entries with empty productCategory', () => {
    expect(() =>
      ExtractionDataValidator.parseConfirmInvoiceEntries([
        { ...createInvoiceEntry(), productCategory: '' },
      ]),
    ).toThrow(/productCategory/);
  });

  it('accepts manufacturing custom product categories on confirm', () => {
    const actualEntries = ExtractionDataValidator.parseConfirmInvoiceEntries([
      { ...createInvoiceEntry(), productCategory: 'Lamiera' },
    ]);
    expect(actualEntries[0]).toMatchObject({ productCategory: 'Lamiera' });
  });

  it('accepts DDT confirm entries without administrativeStatus', () => {
    const actualEntries = ExtractionDataValidator.parseConfirmEntries('ddt', [
      {
        ddtDate: '2026-05-28',
        quantity: 25,
        unitPrice: 18.5,
        totalPrice: 462.5,
        orderNumber: '37/2026',
        productCode: null,
        productName: 'Steel panel',
        supplierVat: '03471920367',
        supplierName: 'EXAMPLE MANUFACTURING S.R.L.',
        sourceChannel: 'llm-primary',
        sourceRowIndex: 0,
        productCategory: 'OTHER',
        registrationNumber: null,
        quantityUnitOfMeasure: 'PZ',
        accepted: true,
      },
    ]);
    expect(actualEntries).toHaveLength(1);
    expect(actualEntries[0]).toMatchObject({
      orderNumber: '37/2026',
      ddtDate: '2026-05-28',
    });
  });

  it('defaults missing invoice administrativeStatus to null on confirm', () => {
    const actualEntries = ExtractionDataValidator.parseConfirmEntries('invoice', [
      {
        ...createInvoiceEntry(),
        administrativeStatus: undefined,
      },
    ]);
    expect(actualEntries[0]).toMatchObject({ administrativeStatus: null });
  });
});

function createInvoiceEntry(overrides: Partial<InvoiceEntry> = {}): InvoiceEntry {
  return {
    productName: 'SERCADIS SC 1 L',
    registrationNumber: '016945',
    productCategory: 'PHYTOSANITARY',
    administrativeStatus: 'Autorizzato',
    quantity: 4,
    quantityUnitOfMeasure: 'PZ',
    supplierName: 'Supplier',
    supplierVat: '01234567890',
    invoiceNumber: 'FT 1',
    invoiceDate: '2025-01-01',
    invoiceDueDate: null,
    unitPrice: 120,
    totalPrice: 480,
    ...overrides,
  };
}
