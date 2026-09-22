/**
 * Extracts an array from a deeply nested API response.
 *
 * Orval wraps as: { data: <BE body>, status: 200, headers }
 * BE body is:     { status: "success", data: { <key>: [...] } }
 *
 * So response.data = { status: "success", data: { <key>: [...] } }
 * We need to traverse: response.data → .data → .<key> → array
 */
export function extractArray(raw: unknown, ...keys: string[]): Record<string, unknown>[] {
  const unwrapped = deepUnwrap(raw);
  if (Array.isArray(unwrapped)) return unwrapped;
  if (unwrapped && typeof unwrapped === 'object') {
    const obj = unwrapped as Record<string, unknown>;
    for (const key of keys) {
      if (key in obj && Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  return [];
}

/** Unwraps { data: { data: ... } } or { data: ... } nesting. */
function deepUnwrap(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if ('data' in obj && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    return deepUnwrap(obj.data);
  }
  return obj;
}

/** Extracts a single object from API response. */
export function extractObject(raw: unknown, ...keys: string[]): Record<string, unknown> | null {
  const unwrapped = deepUnwrap(raw);
  if (!unwrapped || typeof unwrapped !== 'object' || Array.isArray(unwrapped)) return null;
  const obj = unwrapped as Record<string, unknown>;
  for (const key of keys) {
    if (key in obj && obj[key] && typeof obj[key] === 'object') return obj[key] as Record<string, unknown>;
  }
  return obj;
}
