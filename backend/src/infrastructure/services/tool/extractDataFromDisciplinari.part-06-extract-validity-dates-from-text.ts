/**
 * Extracts validity dates from text using regex patterns.
 * This is a lightweight extraction that runs before LLM.
 */
export function extractValidityDatesFromText(text: string): {
  validFrom: string | null;
  validUntil: string | null;
  year: number | null;
} {
  let validFrom: string | null = null;
  let validUntil: string | null = null;
  let year: number | null = null;

  const yearMatch = text.match(/Anno\s*(\d{4})/i) || text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    if (!validUntil) {
      validUntil = `${year}-12-31`;
    }
  }

  const validFromMatch = text.match(/[Vv]alido\s+dal[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (validFromMatch) {
    const [, day, month, yr] = validFromMatch;
    validFrom = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const validUntilMatch = text.match(
    /[Vv]alido\s+(?:fino\s+al|al)[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  );
  if (validUntilMatch) {
    const [, day, month, yr] = validUntilMatch;
    validUntil = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const inVigorMatch = text.match(
    /[Ii]n\s+vigore\s+(?:fino\s+al|dal)[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  );
  if (inVigorMatch) {
    const [, day, month, yr] = inVigorMatch;
    const date = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (text.toLowerCase().includes('fino')) {
      validUntil = date;
    } else {
      validFrom = date;
    }
  }

  return { validFrom, validUntil, year };
}

/**
 * Checks if a disciplinare is expired based on validUntil date.
 */
export function isDisciplinareExpired(validUntil: Date | string | null): boolean {
  if (!validUntil) {
    return false;
  }
  const expiryDate = typeof validUntil === 'string' ? new Date(validUntil) : validUntil;
  return expiryDate < new Date();
}
