const NUMBER_REGEX = /(\d[\d\s]*)$/;

/**
 * Normalizza un numero di registrazione rimuovendo prefissi alfabetici
 * (es. "SKU-16690" -> "16690") e zeri iniziali.
 */
export function cleanRegNumber(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const match = raw.match(NUMBER_REGEX);
  const numericPortion = match ? match[1] : raw;
  const digitsOnly = numericPortion.replace(/\D+/g, '');
  const withoutLeadingZeros = digitsOnly.replace(/^0+/, '');

  return withoutLeadingZeros || '0';
}
