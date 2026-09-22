type JsonSanitizable =
  | string
  | number
  | boolean
  | null
  | readonly JsonSanitizable[]
  | { readonly [key: string]: JsonSanitizable };

const UNSAFE_JSONB_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Removes control characters PostgreSQL JSONB rejects while preserving JSON shape.
 */
export function sanitizeForJsonb<T>(value: T): T {
  return sanitizeValue(value) as T;
}

function sanitizeValue(value: unknown): JsonSanitizable | undefined {
  if (typeof value === 'string') return value.replace(UNSAFE_JSONB_CONTROL_CHARS, '');
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item) ?? null);
  if (typeof value !== 'object' || value === undefined) return undefined;
  const output: Record<string, JsonSanitizable> = {};
  for (const [key, entry] of Object.entries(value)) {
    const sanitized = sanitizeValue(entry);
    if (sanitized !== undefined) output[key.replace(UNSAFE_JSONB_CONTROL_CHARS, '')] = sanitized;
  }
  return output;
}
