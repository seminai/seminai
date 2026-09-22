const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const UUID_TEST_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LONG_HEX_REGEX = /\b[0-9a-f]{16,}\b/gi;
const LONG_HEX_TEST_REGEX = /^[0-9a-f]{16,}$/i;
const ID_TOKEN_REGEX = /\b(?:id|jobid|uuid|guid|threadid|batchid|extractionid)\b/i;

function toWords(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function toTitleCase(words: readonly string[]): string {
  return words
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function hasIdToken(value: string): boolean {
  return ID_TOKEN_REGEX.test(value) || toWords(value).some((word) => ID_TOKEN_REGEX.test(word));
}

export function isLikelyTechnicalId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (UUID_TEST_REGEX.test(trimmed) || LONG_HEX_TEST_REGEX.test(trimmed)) return true;
  if (trimmed.length >= 12 && /^[A-Za-z0-9_-]+$/.test(trimmed) && /\d/.test(trimmed)) return true;
  return false;
}

export function getSafeColumnLabel(columnId: string, columnLabels: Record<string, string>): string {
  const mapped = columnLabels[columnId]?.trim();
  if (mapped && !hasIdToken(mapped)) return mapped;

  const words = toWords(columnId).filter((word) => !hasIdToken(word));
  if (words.length === 0) return 'Colonna';
  return toTitleCase(words);
}

export function sanitizeUserFacingColumnLabel(label: string): string {
  const raw = String(label ?? '').trim();
  if (!raw) return 'Colonna';
  if (hasIdToken(raw) || isLikelyTechnicalId(raw)) {
    return getSafeColumnLabel(raw, {});
  }
  return sanitizeUserFacingText(raw);
}

export function sanitizeUserFacingText(text: string): string {
  if (!text.trim()) return text;
  const withoutUuids = text.replace(UUID_REGEX, '[identificativo nascosto]');
  const withoutHex = withoutUuids.replace(LONG_HEX_REGEX, '[identificativo nascosto]');
  return withoutHex.replace(/(\b[a-zA-Z_]*id\b)\s*[:=]\s*([A-Za-z0-9_-]{6,})/gi, '$1: [nascosto]');
}

export function sanitizeUserFacingValue(value: unknown, fallback = '-'): string {
  if (value == null) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (isLikelyTechnicalId(raw)) return fallback;
  return sanitizeUserFacingText(raw);
}
