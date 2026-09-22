import type {
  ConfirmableStockEntry,
  DdtEntry,
  InvoiceEntry,
  ResolvedCategory,
} from '@/types/extraction';

export function normalizeConfirmEntry(
  entry: ConfirmableStockEntry,
  category: ResolvedCategory,
): ConfirmableStockEntry {
  if (category === 'ddt') {
    return entry;
  }
  const invoiceEntry = entry as InvoiceEntry;
  return {
    ...invoiceEntry,
    administrativeStatus: invoiceEntry.administrativeStatus ?? null,
  };
}

export function isDdtEntry(entry: ConfirmableStockEntry): entry is DdtEntry {
  return 'orderNumber' in entry || 'ddtDate' in entry;
}
