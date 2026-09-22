const LABELLED_REGISTRATION_REGEX =
  /\b(?:reg(?:istrazione)?\.?\s*(?:n\.?|nr\.?|n\s*r\.?)?|presidio(?:\s*(?:n\.?|nr\.?))?)\s*[:#-]?\s*([0-9][0-9\s]{3,})\b/i;
const DATE_SUFFIX_REGEX = /\bdel\s+\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/i;
const STANDALONE_REGISTRATION_REGEX = /\b0*[0-9]{4,6}\b/g;
const YEAR_REGEX = /^(?:19|20)\d{2}$/;

function normalizeInput(value: string): string {
  return value
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeDateSuffix(value: string): string {
  const dateSuffixMatch = value.match(DATE_SUFFIX_REGEX);
  if (!dateSuffixMatch || dateSuffixMatch.index === undefined) {
    return value;
  }
  return value.slice(0, dateSuffixMatch.index).trim();
}

function normalizeDigits(value: string): string | null {
  const digitsOnly = value.replace(/\D+/g, '');
  if (!digitsOnly) {
    return null;
  }
  const normalized = digitsOnly.replace(/^0+/, '');
  return normalized || '0';
}

function extractStandaloneRegistration(raw: string): string | null {
  const candidates = raw.match(STANDALONE_REGISTRATION_REGEX);
  if (!candidates || candidates.length === 0) {
    return null;
  }
  const validCandidate = candidates.find(
    (candidate) => !YEAR_REGEX.test(candidate.replace(/^0+/, '')),
  );
  if (!validCandidate) {
    return null;
  }
  return normalizeDigits(validCandidate);
}

/**
 * Extracts and normalizes a phytosanitary registration number from noisy OCR/invoice strings.
 * Supports variants such as "Reg. n. 012345 del 12/09/1972", "Reg nr 12096" and "presidio 08184".
 */
export function parseRegistrationNumber(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const normalizedInput = normalizeInput(raw);
  const withoutDateSuffix = removeDateSuffix(normalizedInput);
  const labelledMatch = withoutDateSuffix.match(LABELLED_REGISTRATION_REGEX);
  if (labelledMatch?.[1]) {
    return normalizeDigits(labelledMatch[1]);
  }
  const normalizedRawDigits = normalizeDigits(withoutDateSuffix);
  if (/^0*[0-9]{4,6}$/.test(withoutDateSuffix) && normalizedRawDigits) {
    return normalizedRawDigits;
  }
  return extractStandaloneRegistration(withoutDateSuffix);
}
