import { describe, it, expect } from '@jest/globals';
import { enrichInvoiceEntriesWithConversions } from '../infrastructure/services/extraction/enrich-invoice-entries-with-conversions';
import { type InvoiceEntry } from '../domain/dtos/invoice-entry.dto';

function makeEntry(overrides: Partial<InvoiceEntry> = {}): InvoiceEntry {
  return {
    productName: 'Test Product',
    registrationNumber: null,
    productCategory: 'OTHER',
    administrativeStatus: null,
    quantity: 10,
    quantityUnitOfMeasure: 'KG',
    supplierName: null,
    supplierVat: null,
    invoiceNumber: null,
    invoiceDate: null,
    invoiceDueDate: null,
    unitPrice: null,
    totalPrice: null,
    ...overrides,
  };
}

describe('enrichInvoiceEntriesWithConversions', () => {
  it('returns empty array for empty input', () => {
    expect(enrichInvoiceEntriesWithConversions([])).toEqual([]);
  });

  it('enriches entry with known weight unit (KG → kg)', () => {
    const entries = [makeEntry({ quantity: 50, quantityUnitOfMeasure: 'KG' })];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBe(50);
    expect(result[0].unitMeasureConverted).toBe('kg');
  });

  it('enriches entry with known volume unit (LT → L)', () => {
    const entries = [makeEntry({ quantity: 10, quantityUnitOfMeasure: 'LT' })];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBe(10);
    expect(result[0].unitMeasureConverted).toBe('L');
  });

  it('converts tonnellate to kg', () => {
    const entries = [makeEntry({ quantity: 2, quantityUnitOfMeasure: 'tn' })];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBe(2000);
    expect(result[0].unitMeasureConverted).toBe('kg');
  });

  it('passes through unknown units with original values', () => {
    const entries = [makeEntry({ quantity: 5, quantityUnitOfMeasure: 'PZ' })];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBe(5);
    expect(result[0].unitMeasureConverted).toBe('PZ');
  });

  it('does not overwrite entries that already have conversions', () => {
    const entries = [
      makeEntry({
        quantity: 10,
        quantityUnitOfMeasure: 'KG',
        quantityConverted: 99,
        unitMeasureConverted: 'custom',
      }),
    ];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBe(99);
    expect(result[0].unitMeasureConverted).toBe('custom');
  });

  it('leaves entry unchanged when quantity is null', () => {
    const entries = [makeEntry({ quantity: null, quantityUnitOfMeasure: 'KG' })];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBeUndefined();
    expect(result[0].unitMeasureConverted).toBeUndefined();
  });

  it('leaves entry unchanged when unitOfMeasure is null', () => {
    const entries = [makeEntry({ quantity: 10, quantityUnitOfMeasure: null })];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBeUndefined();
    expect(result[0].unitMeasureConverted).toBeUndefined();
  });

  it('enriches multiple entries independently', () => {
    const entries = [
      makeEntry({ quantity: 10, quantityUnitOfMeasure: 'LT' }),
      makeEntry({ quantity: 500, quantityUnitOfMeasure: 'g' }),
      makeEntry({ quantity: null, quantityUnitOfMeasure: 'KG' }),
    ];
    const result = enrichInvoiceEntriesWithConversions(entries);
    expect(result[0].quantityConverted).toBe(10);
    expect(result[0].unitMeasureConverted).toBe('L');
    expect(result[1].quantityConverted).toBe(0.5);
    expect(result[1].unitMeasureConverted).toBe('kg');
    expect(result[2].quantityConverted).toBeUndefined();
  });
});
