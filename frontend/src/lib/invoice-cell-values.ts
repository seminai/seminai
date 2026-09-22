import {
  type InvoiceColumnKey,
} from '@/lib/ag-grid/invoice-columns';
import { createEmptyInvoiceEntry } from '@/lib/ag-grid/invoice-columns';
import {
  defaultAgriculturalCategory,
  defaultManufacturingCategory,
  isKnownAgriculturalCategory,
  MANUFACTURING_ENUM_OPTIONS,
  normalizeProductCategoryValue,
} from '@/lib/extraction-product-category';
import type { ConfirmableStockEntry, InvoiceProductCategory } from '@/types/extraction';

export type InvoiceCellValue = string | number | null | InvoiceProductCategory;

export interface InvoiceCellCategoryContext {
  readonly isManufacturing: boolean;
}

const DEFAULT_AGRICULTURAL_CONTEXT: InvoiceCellCategoryContext = {
  isManufacturing: false,
};

export function getInvoiceCellValue(
  row: ConfirmableStockEntry | undefined,
  columnKey: InvoiceColumnKey,
): InvoiceCellValue {
  if (!row) return getEmptyInvoiceCellValue(columnKey);
  const record = row as Record<InvoiceColumnKey, InvoiceCellValue | undefined>;
  return record[columnKey] ?? getEmptyInvoiceCellValue(columnKey);
}

export function getEmptyInvoiceCellValue(
  columnKey: InvoiceColumnKey,
  context: InvoiceCellCategoryContext = DEFAULT_AGRICULTURAL_CONTEXT,
): InvoiceCellValue {
  if (columnKey === 'productName') return '';
  if (columnKey === 'productCategory') {
    return context.isManufacturing
      ? defaultManufacturingCategory(MANUFACTURING_ENUM_OPTIONS)
      : defaultAgriculturalCategory();
  }
  return null;
}

export function setInvoiceCellValue(
  row: ConfirmableStockEntry,
  columnKey: InvoiceColumnKey,
  value: InvoiceCellValue,
  context: InvoiceCellCategoryContext = DEFAULT_AGRICULTURAL_CONTEXT,
): ConfirmableStockEntry {
  if (columnKey === 'productName') {
    return { ...row, productName: toText(value) };
  }
  if (columnKey === 'productCategory') {
    return {
      ...row,
      productCategory: toProductCategory(value, context.isManufacturing),
    };
  }
  if (columnKey === 'quantity') return { ...row, quantity: toNumberOrNull(value) };
  if (columnKey === 'unitPrice') return { ...row, unitPrice: toNumberOrNull(value) };
  if (columnKey === 'totalPrice') return { ...row, totalPrice: toNumberOrNull(value) };
  if (columnKey === 'registrationNumber') {
    return { ...row, registrationNumber: toTextOrNull(value) };
  }
  if (columnKey === 'administrativeStatus' && 'invoiceNumber' in row) {
    return { ...row, administrativeStatus: toTextOrNull(value) };
  }
  return { ...row, quantityUnitOfMeasure: toTextOrNull(value) };
}

export function isInvoiceCellValueEmpty(
  columnKey: InvoiceColumnKey,
  value: InvoiceCellValue,
  context: InvoiceCellCategoryContext = DEFAULT_AGRICULTURAL_CONTEXT,
): boolean {
  if (columnKey === 'productCategory') {
    const normalized = toProductCategory(value, context.isManufacturing);
    if (context.isManufacturing) {
      return normalized.trim().length === 0;
    }
    return normalized === 'OTHER';
  }
  const normalized = setInvoiceCellValue(
    createEmptyInvoiceEntry(undefined),
    columnKey,
    value,
    context,
  );
  const normalizedValue = getInvoiceCellValue(normalized, columnKey);
  return normalizedValue == null || String(normalizedValue).trim() === '';
}

export function areInvoiceCellValuesEqual(
  columnKey: InvoiceColumnKey,
  left: InvoiceCellValue,
  right: InvoiceCellValue,
  context: InvoiceCellCategoryContext = DEFAULT_AGRICULTURAL_CONTEXT,
): boolean {
  const base = createEmptyInvoiceEntry(undefined);
  return Object.is(
    getInvoiceCellValue(setInvoiceCellValue(base, columnKey, left, context), columnKey),
    getInvoiceCellValue(setInvoiceCellValue(base, columnKey, right, context), columnKey),
  );
}

function toText(value: InvoiceCellValue): string {
  return value == null ? '' : String(value);
}

function toTextOrNull(value: InvoiceCellValue): string | null {
  const text = toText(value).trim();
  return text ? text : null;
}

function toNumberOrNull(value: InvoiceCellValue): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toProductCategory(
  value: InvoiceCellValue,
  isManufacturing: boolean,
): InvoiceProductCategory {
  const text = toText(value).trim();
  return normalizeProductCategoryValue(text, isManufacturing);
}

export function formatProductCategoryLabel(
  value: string,
  options: readonly { readonly value: string; readonly label: string }[],
): string {
  const match = options.find((option) => option.value === value);
  return match?.label ?? value;
}

export { isKnownAgriculturalCategory };
