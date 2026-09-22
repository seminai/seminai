import type { ConfirmableStockEntry, DdtEntry, InvoiceEntry } from '@/types/extraction';

/** Normalized shape used only for equality checks during invoice review. */
export interface NormalizedReviewEntry {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly productCategory: string;
  readonly administrativeStatus: string | null;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly quantityConverted: number | null;
  readonly unitMeasureConverted: string | null;
  readonly accepted: boolean;
  readonly supplierName: string | null;
  readonly supplierVat: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly invoiceDueDate: string | null;
  readonly ddtDate: string | null;
  readonly orderNumber: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
}

export function sanitizeRegistrationNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const firstNumber = trimmed.match(/^\d+/)?.[0];
  if (firstNumber) return firstNumber;
  const firstToken = trimmed.split(/\s+/)[0];
  return firstToken || null;
}

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isInvoiceEntry(entry: ConfirmableStockEntry): entry is InvoiceEntry {
  return 'invoiceNumber' in entry || 'invoiceDate' in entry || 'invoiceDueDate' in entry;
}

function isDdtEntry(entry: ConfirmableStockEntry): entry is DdtEntry {
  return 'ddtDate' in entry || 'orderNumber' in entry;
}

/**
 * Normalizes a review entry for stable equality checks.
 * Ignores UI-only metadata (needsReview, reviewReasons, sourceChannel, …).
 */
export function normalizeReviewEntry(entry: ConfirmableStockEntry): NormalizedReviewEntry {
  const invoice = isInvoiceEntry(entry) ? entry : null;
  const ddt = isDdtEntry(entry) ? entry : null;
  return {
    productName: entry.productName.trim(),
    registrationNumber: sanitizeRegistrationNumber(entry.registrationNumber),
    productCategory: entry.productCategory,
    administrativeStatus: nullIfEmpty(invoice?.administrativeStatus),
    quantity: entry.quantity ?? null,
    quantityUnitOfMeasure: nullIfEmpty(entry.quantityUnitOfMeasure),
    quantityConverted: entry.quantityConverted ?? null,
    unitMeasureConverted: nullIfEmpty(entry.unitMeasureConverted),
    accepted: entry.accepted !== false,
    supplierName: nullIfEmpty(entry.supplierName),
    supplierVat: nullIfEmpty(entry.supplierVat),
    invoiceNumber: nullIfEmpty(invoice?.invoiceNumber),
    invoiceDate: nullIfEmpty(invoice?.invoiceDate),
    invoiceDueDate: nullIfEmpty(invoice?.invoiceDueDate),
    ddtDate: nullIfEmpty(ddt?.ddtDate),
    orderNumber: nullIfEmpty(ddt?.orderNumber),
    unitPrice: entry.unitPrice ?? null,
    totalPrice: entry.totalPrice ?? null,
  };
}

export function areReviewEntriesEqual(
  left: readonly ConfirmableStockEntry[],
  right: readonly ConfirmableStockEntry[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    const a = normalizeReviewEntry(left[index]);
    const b = normalizeReviewEntry(right[index]);
    if (
      a.productName !== b.productName ||
      a.registrationNumber !== b.registrationNumber ||
      a.productCategory !== b.productCategory ||
      a.administrativeStatus !== b.administrativeStatus ||
      a.quantity !== b.quantity ||
      a.quantityUnitOfMeasure !== b.quantityUnitOfMeasure ||
      a.quantityConverted !== b.quantityConverted ||
      a.unitMeasureConverted !== b.unitMeasureConverted ||
      a.accepted !== b.accepted ||
      a.supplierName !== b.supplierName ||
      a.supplierVat !== b.supplierVat ||
      a.invoiceNumber !== b.invoiceNumber ||
      a.invoiceDate !== b.invoiceDate ||
      a.invoiceDueDate !== b.invoiceDueDate ||
      a.ddtDate !== b.ddtDate ||
      a.orderNumber !== b.orderNumber ||
      a.unitPrice !== b.unitPrice ||
      a.totalPrice !== b.totalPrice
    ) {
      return false;
    }
  }
  return true;
}

export function cloneReviewEntries(
  entries: readonly ConfirmableStockEntry[],
): readonly ConfirmableStockEntry[] {
  return entries.map((entry) => ({ ...entry }));
}
