import { describe, expect, it } from 'vitest';
import {
  areReviewEntriesEqual,
  cloneReviewEntries,
  normalizeReviewEntry,
  sanitizeRegistrationNumber,
} from '@/lib/invoice-review-diff';
import type { InvoiceEntry } from '@/types/extraction';

const baseEntry: InvoiceEntry = {
  productName: 'Prodotto A',
  registrationNumber: null,
  productCategory: 'OTHER',
  administrativeStatus: null,
  quantity: 10,
  quantityUnitOfMeasure: 'NR',
  accepted: true,
  supplierName: 'Fornitore',
  supplierVat: '02018010245',
  invoiceNumber: '383 A',
  invoiceDate: '2025-03-31',
  invoiceDueDate: null,
  unitPrice: 1.5,
  totalPrice: 15,
};

describe('sanitizeRegistrationNumber', () => {
  it('extracts leading digits and trims whitespace', () => {
    expect(sanitizeRegistrationNumber('  12345 ABC ')).toBe('12345');
  });

  it('returns null for empty values', () => {
    expect(sanitizeRegistrationNumber('')).toBeNull();
    expect(sanitizeRegistrationNumber(null)).toBeNull();
    expect(sanitizeRegistrationNumber(undefined)).toBeNull();
  });
});

describe('areReviewEntriesEqual', () => {
  it('returns true for identical entries', () => {
    expect(areReviewEntriesEqual([baseEntry], [{ ...baseEntry }])).toBe(true);
  });

  it('detects UDM changes', () => {
    const changed: InvoiceEntry = { ...baseEntry, quantityUnitOfMeasure: 'PZ' };
    expect(areReviewEntriesEqual([baseEntry], [changed])).toBe(false);
  });

  it('detects accepted checkbox toggle', () => {
    const changed: InvoiceEntry = { ...baseEntry, accepted: false };
    expect(areReviewEntriesEqual([baseEntry], [changed])).toBe(false);
  });

  it('treats accepted undefined as accepted true', () => {
    const withoutAccepted: InvoiceEntry = { ...baseEntry, accepted: undefined };
    const withAccepted: InvoiceEntry = { ...baseEntry, accepted: true };
    expect(areReviewEntriesEqual([withoutAccepted], [withAccepted])).toBe(true);
  });

  it('treats registrationNumber with spaces as equal after sanitization', () => {
    const spaced: InvoiceEntry = { ...baseEntry, registrationNumber: '  9988 XYZ ' };
    const clean: InvoiceEntry = { ...baseEntry, registrationNumber: '9988' };
    expect(areReviewEntriesEqual([spaced], [clean])).toBe(true);
  });

  it('treats empty string and null as equal for nullable strings', () => {
    const emptyDue: InvoiceEntry = { ...baseEntry, invoiceDueDate: '' };
    const nullDue: InvoiceEntry = { ...baseEntry, invoiceDueDate: null };
    expect(areReviewEntriesEqual([emptyDue], [nullDue])).toBe(true);
  });

  it('ignores UI-only metadata fields', () => {
    const withMeta = {
      ...baseEntry,
      needsReview: true,
      reviewReasons: ['unit'] as const,
      sourceChannel: 'llm-primary' as const,
    };
    expect(areReviewEntriesEqual([baseEntry], [withMeta])).toBe(true);
  });
});

describe('normalizeReviewEntry', () => {
  it('normalizes accepted and registrationNumber', () => {
    const normalized = normalizeReviewEntry({
      ...baseEntry,
      accepted: undefined,
      registrationNumber: '42-extra',
    });
    expect(normalized.accepted).toBe(true);
    expect(normalized.registrationNumber).toBe('42');
  });
});

describe('cloneReviewEntries', () => {
  it('returns a shallow-cloned array that does not mutate the source', () => {
    const cloned = cloneReviewEntries([baseEntry]);
    expect(cloned).toEqual([baseEntry]);
    expect(cloned[0]).not.toBe(baseEntry);
  });
});
