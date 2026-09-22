/**
 * Cell-coercion and window helpers shared by the QDC sync steps.
 */

import type { Prisma } from '@prisma/client';
import type { QdcRecord } from '../operazioni-parsers';
import { formatDateIT, getHistoryDateRange, getTodayIT, parseDateIT } from '../utils';
import type { QdcCellValue } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const INCREMENTAL_OVERLAP_DAYS = 7;
const MAX_WINDOW_DAYS = 365;
const ITALIAN_DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}/;

export function toNullableString(value: QdcCellValue | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return typeof value === 'string' ? value : String(value);
}

export function toNullableNumber(value: QdcCellValue | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Parses a QDC date cell ('gg/mm/aaaa' or ISO-ish) into a Date, else null. */
export function toNullableDate(value: QdcCellValue | undefined): Date | null {
  const text = toNullableString(value);
  if (!text) {
    return null;
  }
  if (ITALIAN_DATE_PATTERN.test(text)) {
    return parseDateIT(text.slice(0, 10));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Extracts the stable record id from a cell; null when absent/invalid. */
export function toRecordId(value: QdcCellValue | undefined): number | null {
  const numeric = toNullableNumber(value);
  return numeric !== null && Number.isInteger(numeric) ? numeric : null;
}

export function toJson(record: QdcRecord): Prisma.InputJsonValue {
  return record as unknown as Prisma.InputJsonValue;
}

/**
 * Incremental window per azienda: last successful sync minus a 7-day overlap,
 * clamped to the 365-day server maximum; full 365 days on first run.
 */
export function computeSyncWindow(lastSyncedAt: Date | null): { dataDa: string; dataA: string } {
  if (!lastSyncedAt) {
    return getHistoryDateRange(MAX_WINDOW_DAYS);
  }
  const overlapStart = new Date(lastSyncedAt.getTime() - INCREMENTAL_OVERLAP_DAYS * DAY_MS);
  const earliestAllowed = new Date(Date.now() - MAX_WINDOW_DAYS * DAY_MS);
  const effectiveStart = overlapStart < earliestAllowed ? earliestAllowed : overlapStart;
  return { dataDa: formatDateIT(effectiveStart), dataA: getTodayIT() };
}

export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
