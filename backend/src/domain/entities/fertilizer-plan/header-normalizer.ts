import { NutrientKey } from './types';

/**
 * Normalizes a CSV column header into a canonical NutrientKey.
 *
 * The crop_req CSVs come from heterogeneous sources and use Italian, Spanish,
 * English, and a mix of conventions. Examples observed in the dataset:
 *  - "N", "n"
 *  - "P2O5", "P205" (zero instead of capital O)
 *  - "K2O", "K20"
 *  - "MgO", "mg"
 *  - "Ca", "CaO"
 *  - "B Grammi/Ha", "B Gramos/Ha", "B Gram/Ha", "B"
 *
 * Returns null when the header is metadata (e.g. "Giorni Dopo Semina",
 * "Settimana", "Rapporto...", "Día Después Siembra", "Relación...").
 */
export function normalizeHeader(rawHeader: string): NutrientKey | null {
  const cleaned = stripDiacritics(rawHeader).trim().toLowerCase();
  if (cleaned.length === 0) return null;
  if (isRatioMetadata(cleaned)) return null;
  if (isDayMetadata(cleaned)) return null;
  if (isWeekMetadata(cleaned)) return null;

  if (/^n($|\s)/.test(cleaned)) return 'N';
  if (/^p\s*2\s*[o0]\s*5/.test(cleaned)) return 'P2O5';
  if (/^k\s*2\s*[o0]/.test(cleaned)) return 'K2O';
  if (/^mg\s*o?$/.test(cleaned) || /^mgo/.test(cleaned)) return 'MgO';
  if (/^ca(o)?($|\s)/.test(cleaned)) return 'CaO';
  if (/^b($|\s|gram)/.test(cleaned)) return 'B';
  return null;
}

function isRatioMetadata(cleaned: string): boolean {
  return (
    cleaned.startsWith('rapporto') ||
    cleaned.startsWith('relacion') ||
    cleaned.startsWith('relation')
  );
}

function isDayMetadata(cleaned: string): boolean {
  return cleaned.startsWith('giorni') || cleaned.startsWith('dia') || cleaned.startsWith('day');
}

function isWeekMetadata(cleaned: string): boolean {
  return (
    cleaned.startsWith('settimana') || cleaned.startsWith('semana') || cleaned.startsWith('week')
  );
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
