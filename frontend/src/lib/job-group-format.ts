const COMPANY_ID_PREFIX_LENGTH = 37;

function normalizeCompanyName(companyName: string): string {
  const trimmed = companyName.trim();
  return trimmed.length > 0 ? trimmed : 'Azienda';
}

export function parseJobGroupCodeFromGeneratedId(itemId: string): string | null {
  if (!itemId.startsWith('jobs-')) return null;
  if (itemId.length <= COMPANY_ID_PREFIX_LENGTH) return null;
  const encodedCode = itemId.slice(COMPANY_ID_PREFIX_LENGTH);
  if (!encodedCode) return null;
  try {
    const decoded = decodeURIComponent(encodedCode).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return encodedCode.trim().length > 0 ? encodedCode.trim() : null;
  }
}

export function formatCompanyWithJobGroupCode(companyName: string, jobGroupCode: string | null): string {
  const normalizedCompanyName = normalizeCompanyName(companyName);
  if (!jobGroupCode) return normalizedCompanyName;
  return `${normalizedCompanyName} - n. ${jobGroupCode}`;
}

export function formatJobGroupTitle(jobGroupCode: string | null): string {
  if (!jobGroupCode) return 'Gruppo operazioni';
  return `Gruppo operazioni - n. ${jobGroupCode}`;
}
