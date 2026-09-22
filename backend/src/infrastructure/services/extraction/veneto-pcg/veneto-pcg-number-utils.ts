const SQUARE_METERS_PER_HECTARE = 10000;
const AREA_DECIMALS = 4;

export function normalizePcgCadastralNumber(value: unknown): string {
  const trimmed = String(value ?? '')
    .trim()
    .replace(/\u0000/g, '');
  const withoutLeadingZeroes = trimmed.replace(/^0+/, '');
  return withoutLeadingZeroes.length > 0 ? withoutLeadingZeroes : trimmed;
}

export function normalizePcgSubalterno(value: unknown): string | null {
  const trimmed = String(value ?? '')
    .replace(/\u0000/g, '')
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parsePcgNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function squareMetersToHectares(value: unknown): number | null {
  const squareMeters = parsePcgNumber(value);
  if (squareMeters === null || squareMeters <= 0) return null;
  return roundPcgArea(squareMeters / SQUARE_METERS_PER_HECTARE);
}

export function roundPcgArea(value: number): number {
  const factor = 10 ** AREA_DECIMALS;
  return Math.round(value * factor) / factor;
}
