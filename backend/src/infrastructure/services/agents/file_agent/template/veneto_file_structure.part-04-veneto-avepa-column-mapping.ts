import { VenetoAVEPAColumnMapping } from './veneto_file_structure.part-03-is-non-agricultural-use';

/**
 * Default column mapping for Veneto AVEPA "Piano Utilizzo" format
 */
export const VENETO_AVEPA_COLUMN_MAPPING: VenetoAVEPAColumnMapping = {
  // Ubicazione
  comune: 'Comune',
  // Dati catastali
  sezione: 'Sez',
  foglio: 'Fog.',
  particella: 'Part.',
  subalterno: 'Sub',
  // Superfici
  superficieCatastale: 'Sup. Catastale',
  // Irrigazione
  potenzialitaIrrigua: 'Potenz. irriguo',
  // Ciclo
  presenzaCiclo: 'Presenza ciclo',
  tipoCon: 'Tipo Con',
  superficieCondotta: 'Sup. Condotta',
  // Identificativi parcella
  parcellaRif: 'Parcella di rif.',
  // Codice PAC AGEA - this is typically in columns W-X
  // The actual column name might vary, we'll detect it
  codicePacAgea: '',
  // Coltura
  primaColtura: '1a Coltura',
  // Caratteristiche
  serra: 'Serra',
  bio: 'Bio',
  // Superficie utilizzata
  superficieUtilizzata: 'Sup. Utilizzata',
};

/**
 * Metadata extracted from Piano Utilizzo header
 */
export interface PianoUtilizzoMetadata {
  campagna: string | null;
  stato: string | null;
}

/**
 * Check if the file is a Veneto AVEPA "Piano Utilizzo" format
 * Looks for characteristic patterns in the first rows
 */
export function isVenetoAVEPAFormat(headers: string[], rawRows?: string[][]): boolean {
  // Check if headers contain characteristic columns
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  const avepaColumns = ['comune', 'sup. catastale', '1a coltura', 'sup. utilizzata'];

  const hasAvepaColumns = avepaColumns.every((col) =>
    normalizedHeaders.some((h) => h.includes(col) || col.includes(h)),
  );

  // Check for PAC code pattern in headers or data (columns with parentheses like "(870-011-000-000-000)")
  const hasPacPattern =
    normalizedHeaders.some((h) => /\d{3}-\d{3}-\d{3}/.test(h)) ||
    headers.some((h) => /^\(\d{3}-\d{3}/.test(h.trim()));

  // Check raw rows for Piano Utilizzo signature
  if (rawRows && rawRows.length > 0) {
    const firstRows = rawRows.slice(0, 25).map((row) => row.join(' ').toLowerCase());
    const hasPianoUtilizzo = firstRows.some(
      (row) => row.includes('piano utilizzo') || row.includes('avepa'),
    );
    if (hasPianoUtilizzo) {
      return true;
    }
  }

  return hasAvepaColumns || hasPacPattern;
}

/**
 * Extract metadata from Piano Utilizzo header rows
 */
export function extractPianoUtilizzoMetadata(rawRows: string[][]): PianoUtilizzoMetadata {
  const metadata: PianoUtilizzoMetadata = {
    campagna: null,
    stato: null,
  };

  // Search in first 25 rows for Campagna and Stato
  for (let i = 0; i < Math.min(25, rawRows.length); i++) {
    const row = rawRows[i];
    const rowText = row.join(' ');

    // Look for Campagna (year)
    if (rowText.toLowerCase().includes('campagna')) {
      const yearMatch = rowText.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        metadata.campagna = yearMatch[1];
      }
    }

    // Look for Stato
    if (rowText.toLowerCase().includes('stato')) {
      const statoMatch = rowText.match(/stato[:\s]*([\w\s]+)/i);
      if (statoMatch) {
        metadata.stato = statoMatch[1].trim();
      }
    }
  }

  return metadata;
}

/**
 * Find the header row index in Piano Utilizzo format
 * Headers are typically after the metadata rows (around row 22)
 */
export function findAVEPAHeaderRowIndex(rawRows: string[][]): number {
  // Look for row containing "Comune" and "Foglio" or "Fog."
  for (let i = 15; i < Math.min(30, rawRows.length); i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const rowText = row.map((c) => String(c).toLowerCase()).join('|');

    // Check for characteristic header columns
    const hasComune = rowText.includes('comune');
    const hasFoglio = rowText.includes('fog') || rowText.includes('foglio');
    const hasColtura = rowText.includes('coltura') || rowText.includes('1a coltura');

    if (hasComune && (hasFoglio || hasColtura)) {
      return i;
    }
  }

  // Fallback: assume row 21 (0-indexed) which is row 22 in Excel
  return 21;
}

/**
 * Parse PAC code from column value
 * Handles formats like "(870-011-000-000-000)" or "870-011-000-000-000"
 */
export function parsePacCodeFromColumn(value: string): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  // Match PAC code pattern with or without parentheses
  const match = trimmed.match(/\(?(\d{3}-\d{3}-\d{3}-\d{3}-\d{3})\)?/);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Parse "1a Coltura" column to extract crop name
 * Example: "ORZO - FAVE, SEMI, GRANELLA - ORZO" -> { name: "ORZO", fullDescription: "..." }
 */
export function parsePrimaColturaColumn(primaColtura: string): {
  name: string;
  fullDescription: string;
} {
  if (!primaColtura) {
    return { name: '', fullDescription: '' };
  }

  const trimmed = primaColtura.trim();

  // Split by " - " and take first part as main name
  const parts = trimmed.split(' - ').map((p) => p.trim());
  const name = parts[0] || trimmed;

  return {
    name,
    fullDescription: trimmed,
  };
}
