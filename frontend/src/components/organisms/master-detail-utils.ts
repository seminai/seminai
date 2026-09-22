export function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== '-' ? trimmed : null;
}

export function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDateInputValue(value: unknown): string | null {
  if (value == null || value === '') return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function toNullableInput(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function toNullableInputNumber(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toOptionalInput(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toOptionalInputNumber(value: string | undefined): number | undefined {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
