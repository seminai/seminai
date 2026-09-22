const COMUNE_TO_CODICE_NAZIONALE: Readonly<Record<string, string>> = {
  ARCOLE: 'A374',
  'CASTELNOVO BARIANO': 'C215',
  LEGNAGO: 'E512',
  'VALEGGIO SUL MINCIO': 'L567',
  VERONELLA: 'D193',
  'VILLAFRANCA DI VERONA': 'L949',
  ZIMELLA: 'N458',
  'ZIMELLA-ARCOLE SEZ C': 'N895',
} as const;

const CODICE_NAZIONALE_TO_COMUNE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(COMUNE_TO_CODICE_NAZIONALE).map(([comune, code]) => [code, comune]),
);

export function getVenetoPcgComuneCode(comune: string): string | null {
  return COMUNE_TO_CODICE_NAZIONALE[normalizeComune(comune)] ?? null;
}

export function getVenetoPcgComuneName(codiceNazionale: string): string {
  return CODICE_NAZIONALE_TO_COMUNE[codiceNazionale.trim().toUpperCase()] ?? codiceNazionale;
}

function normalizeComune(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}
