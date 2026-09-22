import { CompanyKind } from '@prisma/client';
import { assertConfirmableInvoiceEntries } from '../../infrastructure/services/extraction/confirm-invoice-entries-validator';
import { type InvoiceEntry } from '../../domain/dtos/invoice-entry.dto';

describe('assertConfirmableInvoiceEntries', () => {
  it('accepts a complete reviewed row', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry()],
        allowReviewOverride: false,
      }),
    ).not.toThrow();
  });

  it('blocks rows marked as needsReview without explicit override', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ needsReview: true })],
        allowReviewOverride: false,
      }),
    ).toThrow(/requires review/);
  });

  it('accepts a corrected row with a stale deterministic review reason', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [
          createInvoiceEntry({
            needsReview: true,
            reviewReasons: ['Price mismatch: 1 * 34 != 136'],
            quantity: 4,
            unitPrice: 34,
            totalPrice: 136,
          }),
        ],
        allowReviewOverride: false,
      }),
    ).not.toThrow();
  });

  it('blocks a current price mismatch even when the client omits review metadata', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ quantity: 1, unitPrice: 34, totalPrice: 136 })],
        allowReviewOverride: false,
      }),
    ).toThrow(/Price mismatch: 1 \* 34 != 136/);
  });

  it('keeps non-deterministic OCR review reasons blocked', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [
          createInvoiceEntry({
            needsReview: true,
            reviewReasons: ['Product code/name mismatch with OCR source'],
          }),
        ],
        allowReviewOverride: false,
      }),
    ).toThrow(/Product code\/name mismatch with OCR source/);
  });

  it('allows review and missing price only with explicit override', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ needsReview: true, totalPrice: null })],
        allowReviewOverride: true,
      }),
    ).not.toThrow();
  });

  it('allows a current price mismatch with explicit override', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ quantity: 1, unitPrice: 34, totalPrice: 136 })],
        allowReviewOverride: true,
      }),
    ).not.toThrow();
  });

  it('still blocks missing quantity with explicit override', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ quantity: null })],
        allowReviewOverride: true,
      }),
    ).toThrow(/quantity must be positive/);
  });

  it('accepts manufacturing custom product categories', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ productCategory: 'Lamiera' })],
        allowReviewOverride: false,
        companyKind: CompanyKind.MANUFACTURING,
      }),
    ).not.toThrow();
  });

  it('rejects empty manufacturing categories', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ productCategory: '   ' })],
        allowReviewOverride: false,
        companyKind: CompanyKind.MANUFACTURING,
      }),
    ).toThrow(/productCategory is invalid/);
  });

  it('rejects invalid agricultural product categories', () => {
    expect(() =>
      assertConfirmableInvoiceEntries({
        entries: [createInvoiceEntry({ productCategory: 'INVALID' })],
        allowReviewOverride: false,
        companyKind: CompanyKind.AGRICULTURAL,
      }),
    ).toThrow(/productCategory is invalid/);
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
