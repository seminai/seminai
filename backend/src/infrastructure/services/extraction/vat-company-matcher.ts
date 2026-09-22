import { type PreclassificationCompany } from '../../../domain/dtos/preclassification.dto';
import { normalizeVat } from '../../../domain/utils/vat';

/** Codes extracted from a document used to match it to a company. */
export interface ExtractedFiscalCodes {
  readonly vatNumbers: readonly string[];
  readonly fiscalCodes: readonly string[];
}

/** Result of a deterministic company match attempt. */
export interface VatCompanyMatch {
  readonly companyId: string | null;
  readonly vatHint: string | null;
}

const ELEVEN_DIGITS = /\b(?:IT)?\s*(\d{11})\b/gi;
const FISCAL_CODE = /\b([A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z])\b/g;

/** Normalizes a code by removing whitespace, dots and a leading IT country prefix. */
function normalizeCode(value: string): string {
  return normalizeVat(value) ?? '';
}

/**
 * Scans free text for Italian VAT numbers (11 digits, optionally `IT`-prefixed)
 * and 16-char personal fiscal codes. Returns de-duplicated, normalized codes.
 * Only used to match against the user's OWN companies, so capturing every
 * 11-digit run is safe (a false positive would have to equal a real VAT/CF).
 */
export function extractVatAndFiscalCodes(text: string): ExtractedFiscalCodes {
  const vatNumbers = new Set<string>();
  const fiscalCodes = new Set<string>();
  for (const match of text.matchAll(ELEVEN_DIGITS)) {
    vatNumbers.add(normalizeCode(match[1]));
  }
  for (const match of text.matchAll(FISCAL_CODE)) {
    fiscalCodes.add(normalizeCode(match[1]));
  }
  return { vatNumbers: [...vatNumbers], fiscalCodes: [...fiscalCodes] };
}

function companyCodes(company: PreclassificationCompany): string[] {
  return [company.vatNumber, company.fiscalCode, company.cuaa]
    .filter((code): code is string => Boolean(code))
    .map(normalizeCode)
    .filter((code) => code.length > 0);
}

/**
 * Matches the extracted codes against the user's companies. Returns a companyId
 * only when EXACTLY ONE company matches (ambiguous matches resolve to null).
 */
export function matchCompanyByVat({
  codes,
  companies,
}: {
  readonly codes: ExtractedFiscalCodes;
  readonly companies: readonly PreclassificationCompany[];
}): VatCompanyMatch {
  const found = new Set([...codes.vatNumbers, ...codes.fiscalCodes]);
  if (found.size === 0) {
    return { companyId: null, vatHint: null };
  }
  const matches = companies.filter((company) =>
    companyCodes(company).some((code) => found.has(code)),
  );
  const vatHint = codes.vatNumbers[0] ?? codes.fiscalCodes[0] ?? null;
  if (matches.length !== 1) {
    return { companyId: null, vatHint };
  }
  return { companyId: matches[0].id, vatHint };
}

/** Returns the single company id when the user owns exactly one company, else null. */
export function pickSingleCompany(companies: readonly PreclassificationCompany[]): string | null {
  return companies.length === 1 ? companies[0].id : null;
}
