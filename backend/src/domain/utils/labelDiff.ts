import { LabelExtractionRecord } from '../repositories/ILabelExtractionRepository';
import { LabelFieldChange } from '../dtos/label-history.dto';

const EXCLUDED_FIELDS = ['id', 'createdAt', 'updatedAt'];

/**
 * Computes field-level diffs between an existing label record and new update data.
 * For the `label` JSON field, diffs top-level keys individually (e.g. `label.prodotto`).
 * Normalizes trivial differences: null/empty equivalence, whitespace, array text splitting.
 */
export function calculateLabelChanges(
  existing: LabelExtractionRecord,
  newData: Partial<LabelExtractionRecord>,
): LabelFieldChange[] {
  const changes: LabelFieldChange[] = [];

  for (const [key, newValue] of Object.entries(newData)) {
    if (EXCLUDED_FIELDS.includes(key)) continue;
    if (newValue === undefined) continue;

    const oldValue = existing[key as keyof LabelExtractionRecord];

    if (key === 'label' && typeof oldValue === 'object' && typeof newValue === 'object') {
      const oldLabel = (oldValue ?? {}) as unknown as Record<string, unknown>;
      const newLabel = (newValue ?? {}) as unknown as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(oldLabel), ...Object.keys(newLabel)]);
      for (const subKey of allKeys) {
        if (!isEqual(oldLabel[subKey], newLabel[subKey])) {
          changes.push({
            field: `label.${subKey}`,
            oldValue: serializeValue(oldLabel[subKey]),
            newValue: serializeValue(newLabel[subKey]),
          });
        }
      }
    } else if (!isEqual(oldValue, newValue)) {
      changes.push({
        field: key,
        oldValue: serializeValue(oldValue),
        newValue: serializeValue(newValue),
      });
    }
  }

  return changes;
}

/**
 * Creates a full snapshot of a LabelExtractionRecord for rollback purposes.
 */
export function createLabelSnapshot(record: LabelExtractionRecord): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!EXCLUDED_FIELDS.includes(key)) {
      snapshot[key] = serializeValue(value);
    }
  }
  return snapshot;
}

/**
 * Checks if two values are semantically equal, normalizing trivial differences:
 * - null, undefined, "" are treated as equivalent empty values
 * - String arrays are compared by joining their text content (handles different
 *   comma-splitting of the same text, e.g. ["a, b"] vs ["a", "b"])
 * - Strings are trimmed before comparison
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  // Normalize empty values: null, undefined, "" are all equivalent
  if (isEmpty(a) && isEmpty(b)) return true;

  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();

  // Both are string arrays: compare by joined text to ignore comma-splitting differences
  if (isStringArray(a) && isStringArray(b)) {
    return normalizeTextArray(a) === normalizeTextArray(b);
  }

  // Both are strings: trim and compare
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }

  if (typeof a === 'object' && typeof b === 'object' && a != null && b != null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}

/** Returns true if a value is null, undefined, or an empty string. */
function isEmpty(v: unknown): boolean {
  return v == null || v === '';
}

/** Returns true if the value is an array where every element is a string. */
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((el) => typeof el === 'string');
}

/**
 * Joins a string array into a single normalized string for comparison.
 * This handles cases where the same text is split differently across array elements,
 * e.g. ["P264: Lavare viso, mani"] vs ["P264: Lavare viso", "mani"].
 */
function normalizeTextArray(arr: string[]): string {
  return arr
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}
