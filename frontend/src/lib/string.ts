export function toNonEmptyString(value: unknown): string {
  return String(value ?? '').trim();
}
