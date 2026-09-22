import { boolIta } from './job-detail-italian-labels';
import { toText } from './job-detail-text';

export type AlertNotes = Readonly<Record<string, unknown>>;

export function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Read a scalar/array value with an optional unit suffix sibling key. Returns trimmed string or null. */
export function readWithUnit(notes: AlertNotes | null, key: string, unitKey?: string): string | null {
  if (!notes) return null;
  const v = notes[key];
  if (isEmpty(v)) return null;

  let main: string;
  if (typeof v === 'boolean') main = boolIta(v);
  else if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) main = (v as readonly string[]).join(' • ');
    else return null;
  } else main = toText(v);

  if (!main.trim()) return null;

  if (unitKey) {
    const u = notes[unitKey];
    if (typeof u === 'string' && u.trim()) return `${main} ${u.trim()}`;
  }
  return main;
}

export function readScalar(notes: AlertNotes | null, key: string): string | null {
  if (!notes) return null;
  const v = notes[key];
  if (isEmpty(v)) return null;
  if (typeof v === 'boolean') return boolIta(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return (v as readonly string[]).join(' • ');
  if (typeof v === 'object') return null;
  return toText(v);
}

/** Picks values for a list of keys; returns true if at least one resolves. */
export function hasAny(notes: AlertNotes | null, keys: readonly string[]): boolean {
  if (!notes) return false;
  return keys.some((k) => !isEmpty(notes[k]));
}
