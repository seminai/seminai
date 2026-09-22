/**
 * Type guards for safe type narrowing in the dosage agent module.
 * Replaces unsafe `as unknown as T` casts with runtime validation.
 */

import type { Prisma } from '@prisma/client';
import type { AlertNotesDTO } from '../../../../domain/dtos/alert-notes.dto';
import type { JobHistoryEntry } from '../../../../domain/dtos/job-history.dto';

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a valid AlertNotesDTO structure
 */
export function isAlertNotesDTO(value: unknown): value is AlertNotesDTO {
  if (!isObject(value)) return false;
  // AlertNotesDTO has all optional fields, so we just verify it's an object
  // with the expected shape (all fields are nullable)
  const keys = Object.keys(value);
  const validKeys = new Set([
    'frasi_pericolo',
    'modalita_applicazione',
    'n_max_applicazioni',
    'n_max_applicazioni_um',
    'dose_minima',
    'dose_massima',
    'dose_um',
    'acqua_max',
    'acqua_max_um',
    'epoca_impiego',
    'note_tecniche',
    'epoca_impiego_llm',
    'fasce_di_rispetto_e_deriva',
    'fasce_rispetto_acqua',
    'fasce_rispetto_colture',
    'fasce_di_rispetto_e_deriva_llm',
    'colture_target_fuori_periodo_di_produzione',
    'colture_target_fuori_periodo_di_produzione_llm',
    'resistenze',
    'resistenze_llm',
    'malattie',
    'total_stock_required_for_jobs',
    'total_stock_required_for_jobs_um',
    'stock_out',
    'stock_out_um',
    'stock_in_warehouse',
    'stock_in_warehouse_um',
    'ddt_date_is_ok',
    'ddt_date_conformity',
    'ddt_date_after_treatment',
    'waterHlJob',
    'acquaMaxJob',
    'acquaMaxJob_um',
    'principio_attivo',
    'dose_minima_hl_job',
    'dose_massima_hl_job',
    'excluded_product',
    'exclusion_reason',
    'product_category',
    'ruleViolations',
    'ruleComplianceNotes',
    'disciplinare_info',
  ]);
  return keys.every((key) => validKeys.has(key) || key.startsWith('_'));
}

/**
 * Check if value is a valid JobHistoryEntry array
 */
export function isJobHistoryEntryArray(value: unknown): value is JobHistoryEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!isObject(item)) return false;
    return (
      typeof item.productionUnitId === 'string' &&
      typeof item.productKey === 'string' &&
      typeof item.label === 'string' &&
      typeof item.value === 'string' &&
      typeof item.step === 'string' &&
      typeof item.dataSource === 'string' &&
      typeof item.timestamp === 'string'
    );
  });
}

/**
 * Safely convert AlertNotesDTO to Prisma.JsonValue
 */
export function alertNotesToJson(alertNotes: AlertNotesDTO): Prisma.JsonValue {
  // AlertNotesDTO is a simple object with primitive values, safe to cast
  return alertNotes as unknown as Prisma.JsonValue;
}

/**
 * Safely convert history entries to Prisma.JsonValue
 */
export function historyToJson(
  history: ReadonlyArray<JobHistoryEntry> | JobHistoryEntry[],
): Prisma.JsonValue {
  // JobHistoryEntry[] is serializable, safe to cast
  return history as unknown as Prisma.JsonValue;
}

/**
 * Safely convert excluded product info to Prisma.JsonValue
 */
export function excludedProductInfoToJson(info: {
  excluded_product: boolean;
  exclusion_reason: string;
  product_category: string | null;
}): Prisma.JsonValue {
  return info as Prisma.JsonValue;
}

/**
 * Extract string property safely from unknown object
 */
export function getString(obj: unknown, key: string, fallback: string = ''): string {
  if (!isObject(obj)) return fallback;
  const value = obj[key];
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

/**
 * Extract number property safely from unknown object
 */
export function getNumber(obj: unknown, key: string, fallback: number = NaN): number {
  if (!isObject(obj)) return fallback;
  const value = obj[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Extract boolean property safely from unknown object
 */
export function getBoolean(obj: unknown, key: string, fallback: boolean = false): boolean {
  if (!isObject(obj)) return fallback;
  const value = obj[key];
  if (typeof value === 'boolean') return value;
  return fallback;
}

/**
 * Extract optional string property safely
 */
export function getOptionalString(obj: unknown, key: string): string | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  if (typeof value === 'string') return value.trim() || undefined;
  return undefined;
}

/**
 * Extract optional number property safely
 */
export function getOptionalNumber(obj: unknown, key: string): number | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * Type guard for product with name property
 */
export interface ProductWithName {
  productName?: string;
  name?: string;
}

export function hasProductName(obj: unknown): obj is ProductWithName {
  if (!isObject(obj)) return false;
  return typeof obj.productName === 'string' || typeof obj.name === 'string';
}

/**
 * Type guard for product with registration number
 */
export interface ProductWithRegNumber {
  registrationNumber?: string;
  regNumber?: string;
}

export function hasRegNumber(obj: unknown): obj is ProductWithRegNumber {
  if (!isObject(obj)) return false;
  return typeof obj.registrationNumber === 'string' || typeof obj.regNumber === 'string';
}

/**
 * Type guard for product with quantity
 */
export interface ProductWithQuantity {
  quantity?: number;
  quantityUnitOfMeasure?: string;
}

export function hasQuantity(obj: unknown): obj is ProductWithQuantity {
  if (!isObject(obj)) return false;
  return typeof obj.quantity === 'number';
}

/**
 * Type guard for treatment data
 */
export interface TreatmentData {
  data_distribuzione?: string | null;
  dose?: number | null;
  dosaggio_um?: string | null;
  isLocalizedTreatment?: boolean | null;
  note?: string | null;
  application?: string | null;
  epoca_impiego?: string | null;
  fasce_rispetto_acqua?: string | null;
  fasce_rispetto_colture?: string | null;
  ddt_date_is_ok?: boolean | null;
  ddt_date_conformity?: string | null;
  ddt_date_after_treatment?: boolean | null;
}

export function isTreatmentData(obj: unknown): obj is TreatmentData {
  if (!isObject(obj)) return false;
  // All fields are optional, so just verify it's an object
  return true;
}

/**
 * Type guard for product with treatments
 */
export interface ProductWithTreatments {
  trattamenti?: ReadonlyArray<TreatmentData>;
}

export function hasTrattamenti(obj: unknown): obj is ProductWithTreatments {
  if (!isObject(obj)) return false;
  return Array.isArray(obj.trattamenti);
}

/**
 * Safely extract product name from various input shapes
 */
export function extractProductName(product: unknown): string {
  const name = getString(product, 'productName') || getString(product, 'name');
  return name;
}

/**
 * Safely extract registration number from various input shapes
 */
export function extractRegNumber(product: unknown): string {
  const regNumber = getString(product, 'registrationNumber') || getString(product, 'regNumber');
  return regNumber;
}
