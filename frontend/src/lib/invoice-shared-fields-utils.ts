import type {
  DdtEntry,
  InvoiceEntry,
  ResolvedCategory,
} from '@/types/extraction';

export interface InvoiceSharedFieldValues {
  readonly supplierName: string;
  readonly supplierVat: string;
  readonly invoiceNumber: string;
  readonly invoiceDate: string;
  readonly invoiceDueDate: string;
}

export interface DdtSharedFieldValues {
  readonly supplierName: string;
  readonly supplierVat: string;
  readonly orderNumber: string;
  readonly ddtDate: string;
}

export type DocumentSharedFieldValues = InvoiceSharedFieldValues | DdtSharedFieldValues;

export const INVOICE_SHARED_FIELD_LABELS: Record<keyof InvoiceSharedFieldValues, string> = {
  supplierName: 'Fornitore',
  supplierVat: 'P.IVA Fornitore',
  invoiceNumber: 'N. Fattura',
  invoiceDate: 'Data Fattura',
  invoiceDueDate: 'Scadenza Fattura',
};

export const DDT_SHARED_FIELD_LABELS: Record<keyof DdtSharedFieldValues, string> = {
  supplierName: 'Fornitore',
  supplierVat: 'P.IVA Fornitore',
  orderNumber: 'N. ordine',
  ddtDate: 'Data DDT',
};

/** @deprecated Use getSharedFieldLabels(category) instead. */
export const SHARED_FIELD_LABELS = INVOICE_SHARED_FIELD_LABELS;

export function getSharedFieldLabels(
  category: ResolvedCategory,
): Record<string, string> {
  return category === 'ddt' ? DDT_SHARED_FIELD_LABELS : INVOICE_SHARED_FIELD_LABELS;
}

export function extractSharedFields(
  entries: readonly (InvoiceEntry | DdtEntry)[],
  category: ResolvedCategory,
): DocumentSharedFieldValues {
  const first = entries[0];
  if (!first) {
    return category === 'ddt'
      ? { supplierName: '', supplierVat: '', orderNumber: '', ddtDate: '' }
      : {
          supplierName: '',
          supplierVat: '',
          invoiceNumber: '',
          invoiceDate: '',
          invoiceDueDate: '',
        };
  }
  if (category === 'ddt') {
    const ddtEntry = first as DdtEntry;
    return {
      supplierName: ddtEntry.supplierName ?? '',
      supplierVat: ddtEntry.supplierVat ?? '',
      orderNumber: ddtEntry.orderNumber ?? '',
      ddtDate: ddtEntry.ddtDate ?? '',
    };
  }
  const invoiceEntry = first as InvoiceEntry;
  return {
    supplierName: invoiceEntry.supplierName ?? '',
    supplierVat: invoiceEntry.supplierVat ?? '',
    invoiceNumber: invoiceEntry.invoiceNumber ?? '',
    invoiceDate: invoiceEntry.invoiceDate ?? '',
    invoiceDueDate: invoiceEntry.invoiceDueDate ?? '',
  };
}

export function applySharedFieldChange(
  entries: readonly (InvoiceEntry | DdtEntry)[],
  _category: ResolvedCategory,
  key: string,
  value: string,
): readonly (InvoiceEntry | DdtEntry)[] {
  const normalizedValue = value || null;
  return entries.map((entry) => ({ ...entry, [key]: normalizedValue }));
}
