import { type InvoiceEntry } from '../../domain/dtos/invoice-entry.dto';
import { reconcileInvoiceEntryPrice } from '../../infrastructure/services/extraction/reconcile-invoice-entry-price';

describe('reconcileInvoiceEntryPrice', () => {
  it('derives unit price from quantity and authoritative total price', () => {
    const inputEntry = createInvoiceEntry({
      quantity: 9,
      unitPrice: 32,
      totalPrice: 297,
    });
    const actualEntry = reconcileInvoiceEntryPrice(inputEntry);
    expect(actualEntry.unitPrice).toBe(33);
    expect(actualEntry.needsReview).toBe(false);
    expect(actualEntry.reviewReasons).toEqual([]);
  });

  it('clears a resolved price mismatch review reason', () => {
    const inputEntry = createInvoiceEntry({
      quantity: 1,
      unitPrice: 34,
      totalPrice: 136,
      needsReview: true,
      reviewReasons: ['Price mismatch: 1 * 34 != 136'],
    });
    const actualEntry = reconcileInvoiceEntryPrice(inputEntry);
    expect(actualEntry.unitPrice).toBe(136);
    expect(actualEntry.needsReview).toBe(false);
    expect(actualEntry.reviewReasons).toEqual([]);
  });

  it('preserves non-deterministic review reasons', () => {
    const inputEntry = createInvoiceEntry({
      quantity: 1,
      unitPrice: 34,
      totalPrice: 136,
      needsReview: true,
      reviewReasons: ['Product code/name mismatch with OCR source'],
    });
    const actualEntry = reconcileInvoiceEntryPrice(inputEntry);
    expect(actualEntry.unitPrice).toBe(136);
    expect(actualEntry.needsReview).toBe(true);
    expect(actualEntry.reviewReasons).toEqual(['Product code/name mismatch with OCR source']);
  });

  it('preserves an unspecified review after correcting the price', () => {
    const inputEntry = createInvoiceEntry({
      quantity: 1,
      unitPrice: 34,
      totalPrice: 136,
      needsReview: true,
    });
    const actualEntry = reconcileInvoiceEntryPrice(inputEntry);
    expect(actualEntry.unitPrice).toBe(136);
    expect(actualEntry.needsReview).toBe(true);
    expect(actualEntry.reviewReasons).toEqual([]);
  });

  it('keeps coherent prices unchanged', () => {
    const inputEntry = createInvoiceEntry();
    expect(reconcileInvoiceEntryPrice(inputEntry)).toBe(inputEntry);
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
