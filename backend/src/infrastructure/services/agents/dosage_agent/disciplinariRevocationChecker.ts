import { DisciplinariEntry } from '../../tool/getDisciplinariFromBDF';
import {
  checkProductRevoked,
  buildRevokedExclusionMessage,
  isProductActiveInDataset,
} from './revokedProductChecker';
import { searchRevocationStatus } from '../../tool/tavilyRevocationSearchTool';

/**
 * Source of the revocation check result.
 */
export type RevocationSource = 'disciplinari_csv' | 'ministerial_dataset' | 'tavily_search';

/**
 * Status result from disciplinari revocation check.
 */
export interface DisciplinariRevocationStatus {
  readonly isRevoked: boolean;
  readonly isExpiredCommercio: boolean;
  readonly isExpiredUtilizzo: boolean;
  readonly revokedFlag: boolean;
  readonly scadenzaCommercio?: Date;
  readonly scadenzaUtilizzo?: Date;
  readonly applicationDate: Date;
  readonly reason: string;
  readonly source: RevocationSource;
  readonly sourceUrl?: string;
}

/**
 * Parses a date string in Italian format (DD/MM/YYYY) to a Date object.
 *
 * @param dateStr - Date string in DD/MM/YYYY format
 * @returns Parsed Date object or undefined if invalid
 */
export function parseDisciplinariDate(dateStr?: string | null): Date | undefined {
  if (!dateStr || typeof dateStr !== 'string') {
    return undefined;
  }

  const trimmed = dateStr.trim();
  if (!trimmed) {
    return undefined;
  }

  // Handle DD/MM/YYYY format
  const match = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (!match) {
    return undefined;
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
  let year = parseInt(match[3], 10);

  // Handle 2-digit years
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }

  // Validate date components
  if (day < 1 || day > 31 || month < 0 || month > 11) {
    return undefined;
  }

  const date = new Date(year, month, day);

  // Verify the date is valid (handles edge cases like Feb 30)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return undefined;
  }

  return date;
}

/**
 * Converts a DisciplinariEntry to a Record<string, string> for easier field access.
 */
function entryToRecord(entry: DisciplinariEntry): Record<string, string> {
  return entry.data.reduce<Record<string, string>>(
    (accumulator, field) => {
      if (field.type) {
        accumulator[field.type] = field.value;
      }
      return accumulator;
    },
    {} as Record<string, string>,
  );
}

/**
 * Checks the REVOCATO field value.
 */
function isRevokedFlag(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'si';
}

/**
 * Formats a date for display in Italian format.
 */
function formatDateItalian(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Checks revocation status from a single disciplinari record.
 *
 * @param record - Record extracted from disciplinari CSV entry
 * @param applicationDate - Date when the treatment will be applied
 * @returns Revocation status with details
 */
export function checkDisciplinariRevocation(
  record: Record<string, string>,
  applicationDate: Date,
): DisciplinariRevocationStatus {
  const revokedFlag = isRevokedFlag(record.REVOCATO);
  const scadenzaCommercio = parseDisciplinariDate(record.SCADENZA_COMMERCIO);
  const scadenzaUtilizzo = parseDisciplinariDate(record.SCADENZA_UTILIZZO);

  const isExpiredCommercio = scadenzaCommercio ? scadenzaCommercio < applicationDate : false;
  const isExpiredUtilizzo = scadenzaUtilizzo ? scadenzaUtilizzo < applicationDate : false;

  const isRevoked = revokedFlag || isExpiredCommercio || isExpiredUtilizzo;

  // Build reason message
  const reasons: string[] = [];

  if (revokedFlag) {
    const revokeDate = record.REVOCA_AUTORIZZAZIONE || record.DATA_REVOCA;
    if (revokeDate) {
      reasons.push(`Prodotto revocato dal ${revokeDate}`);
    } else {
      reasons.push('Prodotto revocato');
    }
  }

  if (isExpiredCommercio && scadenzaCommercio) {
    reasons.push(
      `Scadenza commercializzazione: ${formatDateItalian(scadenzaCommercio)} (applicazione prevista: ${formatDateItalian(applicationDate)})`,
    );
  }

  if (isExpiredUtilizzo && scadenzaUtilizzo) {
    reasons.push(
      `Scadenza utilizzo: ${formatDateItalian(scadenzaUtilizzo)} (applicazione prevista: ${formatDateItalian(applicationDate)})`,
    );
  }

  const reason =
    reasons.length > 0
      ? reasons.join('. ')
      : 'Nessuna informazione di revoca trovata nel disciplinare';

  return {
    isRevoked,
    isExpiredCommercio,
    isExpiredUtilizzo,
    revokedFlag,
    scadenzaCommercio,
    scadenzaUtilizzo,
    applicationDate,
    reason,
    source: 'disciplinari_csv',
  };
}

/**
 * Checks revocation status with fallback chain:
 * 1. Disciplinari CSV entries
 * 2. Ministerial dataset (revokedProductChecker)
 * 3. Tavily search (official sources)
 *
 * @param productName - Commercial name of the product
 * @param regNumber - Registration number
 * @param applicationDate - Date when treatment will be applied
 * @param disciplinariEntries - Entries from disciplinari CSV
 * @param region - Optional region for Tavily search
 * @returns Revocation status from the first source with results
 */
export async function checkRevocationWithFallback(
  productName: string,
  regNumber: string,
  applicationDate: Date,
  disciplinariEntries: readonly DisciplinariEntry[],
  region?: string,
): Promise<DisciplinariRevocationStatus> {
  // Step 1: Check disciplinari CSV entries
  for (const entry of disciplinariEntries) {
    const record = entryToRecord(entry);
    const status = checkDisciplinariRevocation(record, applicationDate);

    if (status.isRevoked) {
      console.log(
        `[REVOCATION-CHECK] Product ${productName} (${regNumber}) revoked via disciplinari CSV: ${status.reason}`,
      );
      return status;
    }
  }

  // Step 2: Check ministerial dataset
  const ministerialCheck = checkProductRevoked(regNumber, productName);
  if (ministerialCheck.isRevoked && ministerialCheck.info) {
    const reason = buildRevokedExclusionMessage(ministerialCheck.info);
    console.log(
      `[REVOCATION-CHECK] Product ${productName} (${regNumber}) revoked via ministerial dataset: ${reason}`,
    );
    return {
      isRevoked: true,
      isExpiredCommercio: false,
      isExpiredUtilizzo: false,
      revokedFlag: true,
      scadenzaCommercio: ministerialCheck.info.revokeDate
        ? parseDisciplinariDate(ministerialCheck.info.revokeDate)
        : undefined,
      applicationDate,
      reason,
      source: 'ministerial_dataset',
    };
  }

  // Step 3: Fallback to Tavily search — only when the product is NOT already
  // known as active in the ministerial dataset. If the ministry says the product
  // is "Rinnovato" / "Autorizzato" / etc., Tavily keyword-based search would
  // produce false positives and must be skipped.
  const isActiveInMinistry = isProductActiveInDataset(regNumber, productName);
  if (isActiveInMinistry) {
    console.log(
      `[REVOCATION-CHECK] Product ${productName} (${regNumber}) is ACTIVE in ministerial dataset — skipping Tavily search`,
    );
  } else {
    const tavilyResult = await searchRevocationStatus({
      productName,
      registrationNumber: regNumber,
      region,
    });

    if (tavilyResult?.isRevoked) {
      const reason =
        tavilyResult.reason ?? `Prodotto risulta revocato secondo ${tavilyResult.source}`;
      console.log(
        `[REVOCATION-CHECK] Product ${productName} (${regNumber}) revoked via Tavily search: ${reason}`,
      );
      return {
        isRevoked: true,
        isExpiredCommercio: false,
        isExpiredUtilizzo: false,
        revokedFlag: true,
        scadenzaCommercio: tavilyResult.expirationDate
          ? parseDisciplinariDate(tavilyResult.expirationDate)
          : undefined,
        applicationDate,
        reason,
        source: 'tavily_search',
        sourceUrl: tavilyResult.sourceUrl,
      };
    }
  }

  // No revocation found
  return {
    isRevoked: false,
    isExpiredCommercio: false,
    isExpiredUtilizzo: false,
    revokedFlag: false,
    applicationDate,
    reason: 'Prodotto non risulta revocato',
    source: 'disciplinari_csv',
  };
}
