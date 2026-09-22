export function summarizeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    const raw = JSON.stringify(value);
    if (!raw) return null;
    return raw.length > 800 ? `${raw.slice(0, 800)}...` : raw;
  } catch {
    return null;
  }
}
