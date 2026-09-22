/**
 * Parses a date string in ISO (YYYY-MM-DD) or Italian formats (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY).
 * Supports two-digit years by normalizing them to 2000-based (e.g., 24 -> 2024).
 * Returns null when the input is empty or cannot be parsed.
 */
export function parseDate(dateString: string | Date | null | undefined): Date | null {
  if (!dateString) return null;
  if (dateString instanceof Date) {
    return Number.isNaN(dateString.getTime()) ? null : dateString;
  }
  const isoDate = new Date(dateString);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate;
  }
  const separators = ['/', '-', '.'];
  for (const separator of separators) {
    if (!dateString.includes(separator)) continue;
    const parts = dateString.split(separator);
    if (parts.length !== 3) continue;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const rawYear = parseInt(parts[2], 10);
    const normalizedYear = rawYear < 100 ? 2000 + rawYear : rawYear;
    const candidate = new Date(normalizedYear, month, day);
    const isValidDate =
      !Number.isNaN(candidate.getTime()) &&
      candidate.getDate() === day &&
      candidate.getMonth() === month &&
      candidate.getFullYear() === normalizedYear;
    if (isValidDate) {
      return candidate;
    }
  }

  // Handle Excel serial number dates (e.g., 45740 → 2025-03-11)
  const trimmed = String(dateString).trim();
  const numValue = parseFloat(trimmed);
  if (
    !Number.isNaN(numValue) &&
    numValue > 1000 &&
    numValue < 3000000 &&
    /^\d+(\.\d+)?$/.test(trimmed)
  ) {
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const date = new Date(excelEpoch.getTime() + numValue * 86400000);
    if (!Number.isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
      return date;
    }
  }

  return null;
}
