/**
 * Parse number from string, correctly handling Italian format (dot as thousands, comma as decimal).
 * Examples: "1.234,56" → 1234.56 | "6,5700" → 6.57 | "42" → 42
 */
export function parseNumber(value: string | null): number | null {
  if (!value) return null;

  // Remove dots used as thousands separators, then replace comma with dot for decimal
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? null : num;
}

/**
 * Parse date from various formats to ISO YYYY-MM-DD
 */
export function parseDate(value: string | null): string | null {
  if (!value) return null;

  // Try dd/mm/yyyy format
  const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Try dd-mm-yyyy format
  const ddmmyyyyDash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyDash) {
    const day = ddmmyyyyDash[1].padStart(2, '0');
    const month = ddmmyyyyDash[2].padStart(2, '0');
    const year = ddmmyyyyDash[3];
    return `${year}-${month}-${day}`;
  }

  // Try yyyy-mm-dd format
  const yyyymmdd = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Try Date parsing as fallback
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Normalize string for comparison/aggregation
 */
export function normalizeString(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Clean bracket value like "[000] -" → null, "[003] SOMETHING" → "SOMETHING"
 */
export function cleanBracketValue(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\[\d+\]\s*(.*)$/);
  if (match) {
    const inner = match[1].trim();
    if (inner === '-' || inner === '' || inner === '0') {
      return null;
    }
    return inner;
  }
  return value.trim() || null;
}

/**
 * Parse occupation string like "[003] COLZA" into code and name
 */
export function parseOccupazione(value: string): { code: string | null; name: string | null } {
  const match = value.match(/^\[(\d+)\]\s*(.*)$/);
  if (match) {
    return { code: match[1], name: match[2].trim() || null };
  }
  return { code: null, name: value.trim() || null };
}

// ---------------------------------------------------------------------------
// Column mapping validation (fuzzy match)
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance between two strings (case-insensitive)
 */
export function levenshteinDistance(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= al.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= al.length; i++) {
    for (let j = 1; j <= bl.length; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[al.length][bl.length];
}

/**
 * Find the closest matching header name for a given column name.
 * Returns null if no reasonable match is found.
 */
export function findClosestHeader(colName: string, headers: string[]): string | null {
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  // Max threshold: scale with string length but cap at 5
  const maxDistance = Math.min(5, Math.max(2, Math.floor(colName.length * 0.3)));

  for (const header of headers) {
    const dist = levenshteinDistance(colName, header);
    if (dist < bestDistance && dist <= maxDistance) {
      bestDistance = dist;
      bestMatch = header;
    }
  }

  return bestMatch;
}

/**
 * Validate that LLM-returned column names actually exist in the CSV headers.
 * Attempts fuzzy matching for close misses.
 *
 * @param columns  - Record where keys are semantic names and values are CSV column names (or null)
 * @param headers  - Actual CSV header names
 * @returns fixed columns record and list of warnings
 */
export function validateColumnMapping<T extends Record<string, string | null>>(
  columns: T,
  headers: string[],
): { columns: T; warnings: string[] } {
  const warnings: string[] = [];
  const headerSet = new Set(headers);
  const fixed = { ...columns };

  for (const [key, colName] of Object.entries(fixed)) {
    if (colName && !headerSet.has(colName)) {
      const bestMatch = findClosestHeader(colName, headers);
      if (bestMatch) {
        (fixed as Record<string, string | null>)[key] = bestMatch;
        warnings.push(`Colonna "${colName}" corretta in "${bestMatch}" (fuzzy match)`);
      } else {
        (fixed as Record<string, string | null>)[key] = null;
        warnings.push(`Colonna "${colName}" non trovata nel file (campo: ${key})`);
      }
    }
  }

  return { columns: fixed, warnings };
}
