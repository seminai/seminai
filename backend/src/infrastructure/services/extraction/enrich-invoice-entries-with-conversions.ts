import { type InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import { convertQuantityToCanonicalUnit } from '../../utils/quantityConversion';
import { parsePackagingFromDescription } from '../../utils/parsePackagingFromDescription';

const CONTAINER_UNITS: ReadonlySet<string> = new Set(['PZ', 'NR', 'CF', 'SC', 'CT', 'CN']);

function isContainerUnit(unit: string | null): boolean {
  if (!unit) return false;
  return CONTAINER_UNITS.has(unit.trim().toUpperCase());
}

function tryPackagingConversion(entry: InvoiceEntry) {
  if (entry.quantity === null || entry.quantity === undefined) return null;
  if (!isContainerUnit(entry.quantityUnitOfMeasure)) return null;
  const packaging = parsePackagingFromDescription(entry.productName);
  if (!packaging) return null;
  return convertQuantityToCanonicalUnit(entry.quantity * packaging.value, packaging.unit);
}

/**
 * Enriches invoice entries with pre-computed canonical quantity conversions.
 * Entries that already have both quantityConverted and unitMeasureConverted are left unchanged.
 *
 * When the unit of measure is a container (PZ/NR/CF/SC/CT/CN) and the product
 * description carries a packaging descriptor (e.g. "REXXAR DA ML 300"), the
 * descriptor is multiplied by the line quantity and converted to the canonical
 * volume/weight unit. Otherwise the raw quantity+unit pair is converted.
 */
export function enrichInvoiceEntriesWithConversions(
  entries: readonly InvoiceEntry[],
): readonly InvoiceEntry[] {
  return entries.map((entry) => {
    if (entry.quantityConverted != null && entry.unitMeasureConverted != null) {
      return entry;
    }
    const conversion =
      tryPackagingConversion(entry) ??
      convertQuantityToCanonicalUnit(entry.quantity, entry.quantityUnitOfMeasure);
    if (!conversion) return entry;
    return {
      ...entry,
      quantityConverted: conversion.quantityConverted,
      unitMeasureConverted: conversion.unitMeasureConverted,
    };
  });
}
