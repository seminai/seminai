export type CompanyKind = 'AGRICULTURAL' | 'MANUFACTURING';

export const COMPANY_KIND_LABELS: Record<CompanyKind, string> = {
  AGRICULTURAL: 'Agricola',
  MANUFACTURING: 'Manifatturiera',
};

export function isAgriculturalCompany(kind?: CompanyKind | null): boolean {
  return !kind || kind === 'AGRICULTURAL';
}

export function parseCompanyKind(value: unknown): CompanyKind {
  return value === 'MANUFACTURING' ? 'MANUFACTURING' : 'AGRICULTURAL';
}
