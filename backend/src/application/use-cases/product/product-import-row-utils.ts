import type { WorkBook } from 'xlsx';
import * as XLSX from 'xlsx';

export function normalizeImportNumber(value: string | number): number {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return 0;
  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  let normalized = trimmed;
  if (hasComma && hasDot) {
    normalized =
      trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed.replace(/,/g, '');
  } else if (hasComma) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    normalized = trimmed.replace(/,/g, '');
  }
  const parsed = Number.parseFloat(normalized.replace(/\s/g, ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeHeaderKey(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildHeaderIndexMap(headerRow: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  headerRow.forEach((column, index) => {
    const normalized = normalizeHeaderKey(column);
    if (normalized && !result.has(normalized)) result.set(normalized, index);
  });
  return result;
}

export function findColumnIndex(
  headerIndexMap: ReadonlyMap<string, number>,
  possibleNames: readonly string[],
): number {
  for (const name of possibleNames) {
    const index = headerIndexMap.get(normalizeHeaderKey(name));
    if (index !== undefined) return index;
  }
  return -1;
}

export function isUnitSubHeaderRow(row: readonly string[]): boolean {
  const nonEmpty = row.filter((cell) => String(cell ?? '').trim().length > 0);
  if (nonEmpty.length < 2) return false;
  const unitPattern = /^[\(\)]?[a-zà-ü\s\/\-\.€0-9]+[\(\)]?$/i;
  return nonEmpty.every((cell) => {
    const value = String(cell).trim();
    return value.length < 30 && unitPattern.test(value);
  });
}

export function findHeaderRowIndex(rows: readonly string[][]): number {
  const maxScan = Math.min(rows.length, 15);
  for (let index = 0; index < maxScan; index += 1) {
    const row = rows[index];
    const nonEmpty = row.filter((cell) => String(cell ?? '').trim().length > 0);
    if (nonEmpty.length < 4) continue;
    const textCells = nonEmpty.filter((cell) => {
      const value = String(cell).trim();
      return value.length > 0 && value.length < 60 && !/^\d+([.,]\d+)?$/.test(value);
    });
    if (textCells.length >= nonEmpty.length * 0.6 && textCells.length >= 4) {
      if (!isUnitSubHeaderRow(row)) return index;
    }
  }
  return rows.findIndex((row) => row.some((cell) => String(cell ?? '').trim()));
}

export function detectCsvDelimiter(content: string): string {
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return ';';
  for (const delimiter of [';', '\t']) {
    const counts = lines.slice(0, 5).map((line) => line.split(delimiter).length);
    if (counts[0] > 1 && counts.every((count) => count === counts[0])) return delimiter;
  }
  return lines[0].includes(';') ? ';' : ',';
}

export function isValidUnitOfMeasure(value: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  const valid = [
    'kg',
    'lt',
    'l',
    'g',
    'ml',
    'pz',
    'n°',
    'n',
    'pezzi',
    'unità',
    'conf',
    'confezione',
    'confezioni',
    'sacchi',
    'sacco',
    'flacone',
    'flaconi',
    'bottiglia',
    'bottiglie',
    'tanica',
    'taniche',
  ];
  return valid.some((unit) => normalized === unit || normalized.startsWith(unit));
}

export function looksLikeNumber(value: string): boolean {
  return /^\d+$/.test(value?.trim() ?? '');
}

export function normalizeMovementType(value: string): 'IN' | 'OUT' {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  return normalized === 'OUT' || normalized === 'USCITA' || normalized === 'SCARICO' ? 'OUT' : 'IN';
}

export function selectBestSheet(workbook: WorkBook): string {
  const dataKeywords = ['magazzino', 'scheda', 'dati', 'prodott', 'societa'];
  const skipKeywords = ['frontespizio', 'ordini', 'copertina', 'storico', 'foglio'];
  const candidates = workbook.SheetNames.filter(
    (name) => !skipKeywords.some((keyword) => name.toLowerCase().includes(keyword)),
  );
  const keywordMatch = candidates.find((name) =>
    dataKeywords.some((keyword) => name.toLowerCase().includes(keyword)),
  );
  if (keywordMatch) return keywordMatch;
  const pool = candidates.length > 0 ? candidates : workbook.SheetNames;
  return pool.reduce((best, name) => {
    const bestRows = XLSX.utils.sheet_to_json(workbook.Sheets[best], { header: 1 }).length;
    const candidateRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).length;
    return candidateRows > bestRows ? name : best;
  }, pool[0]);
}
