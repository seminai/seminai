import { parseNullableNumber } from '@/lib/parse-utils';
import type { ConfirmableStockEntry, DdtEntry, InvoiceEntry, ResolvedCategory } from '@/types/extraction';

export type InvoiceColumnKey =
  | 'productName'
  | 'registrationNumber'
  | 'productCategory'
  | 'administrativeStatus'
  | 'quantity'
  | 'quantityUnitOfMeasure'
  | 'unitPrice'
  | 'totalPrice';

export const NUMERIC_KEYS: ReadonlySet<InvoiceColumnKey> = new Set([
  'quantity',
  'unitPrice',
  'totalPrice',
]);

export const STRING_NULLABLE_KEYS: ReadonlySet<InvoiceColumnKey> = new Set([
  'registrationNumber',
  'productCategory',
  'administrativeStatus',
  'quantityUnitOfMeasure',
]);

export interface InvoiceColumn {
  readonly key: InvoiceColumnKey;
  readonly label: string;
  readonly minWidth: number;
}

export const COLUMNS: ReadonlyArray<InvoiceColumn> = [
  { key: 'productName', label: 'Prodotto', minWidth: 180 },
  { key: 'registrationNumber', label: 'N. Reg.', minWidth: 120 },
  { key: 'productCategory', label: 'Categoria', minWidth: 120 },
  { key: 'administrativeStatus', label: 'Stato Amm.', minWidth: 110 },
  { key: 'quantity', label: 'Quantità', minWidth: 100 },
  { key: 'quantityUnitOfMeasure', label: 'UDM', minWidth: 80 },
  { key: 'unitPrice', label: 'Prezzo Unit.', minWidth: 110 },
  { key: 'totalPrice', label: 'Prezzo Tot.', minWidth: 110 },
];

export function getColumnsForCategory(
  category: ResolvedCategory = 'invoice',
  isManufacturing = false,
): ReadonlyArray<InvoiceColumn> {
  let columns = COLUMNS;
  if (category === 'ddt') {
    columns = columns.filter((column) => column.key !== 'administrativeStatus');
  }
  if (isManufacturing) {
    columns = columns.filter(
      (column) => column.key !== 'registrationNumber' && column.key !== 'administrativeStatus',
    );
  }
  return columns;
}

export function createEmptyInvoiceEntry(
  template: ConfirmableStockEntry | undefined,
): ConfirmableStockEntry {
  if (template && !isInvoiceEntry(template)) {
    const ddtTemplate = template;
    return {
      productName: '',
      registrationNumber: null,
      productCategory: 'OTHER',
      quantity: null,
      quantityUnitOfMeasure: null,
      accepted: true,
      supplierName: ddtTemplate.supplierName ?? null,
      supplierVat: ddtTemplate.supplierVat ?? null,
      ddtDate: ddtTemplate.ddtDate ?? null,
      orderNumber: ddtTemplate.orderNumber ?? null,
      unitPrice: ddtTemplate.unitPrice ?? null,
      totalPrice: ddtTemplate.totalPrice ?? null,
    } satisfies DdtEntry;
  }
  return {
    productName: '',
    registrationNumber: null,
    productCategory: 'OTHER',
    administrativeStatus: null,
    quantity: null,
    quantityUnitOfMeasure: null,
    accepted: true,
    supplierName: template?.supplierName ?? null,
    supplierVat: template?.supplierVat ?? null,
    invoiceNumber: isInvoiceEntry(template) ? template.invoiceNumber ?? null : null,
    invoiceDate: isInvoiceEntry(template) ? template.invoiceDate ?? null : null,
    invoiceDueDate: isInvoiceEntry(template) ? template.invoiceDueDate ?? null : null,
    unitPrice: null,
    totalPrice: null,
  } satisfies InvoiceEntry;
}

export function applyCellValue(
  entry: ConfirmableStockEntry,
  field: InvoiceColumnKey,
  value: string,
): ConfirmableStockEntry {
  if (NUMERIC_KEYS.has(field)) {
    return { ...entry, [field]: parseNullableNumber(value) };
  }
  if (field === 'productName') {
    return { ...entry, productName: value };
  }
  if (STRING_NULLABLE_KEYS.has(field)) {
    return { ...entry, [field]: value || null };
  }
  return entry;
}

function isInvoiceEntry(entry: ConfirmableStockEntry | undefined): entry is InvoiceEntry {
  return entry != null && 'invoiceNumber' in entry;
}
