import { HeaderDetectionResult } from './header_detector.part-01-header-indicators';

/**
 * Detect the regional format based on normalized headers
 */
export function detectFormat(
  headers: string[],
):
  | 'piemonte'
  | 'lombardia'
  | 'emilia_romagna'
  | 'veneto'
  | 'veneto_avepa'
  | 'cia_schedario_viticolo'
  | 'unknown' {
  const headerSet = new Set(headers.map((h) => h.toLowerCase()));
  const headerText = headers.join(' ').toLowerCase();

  // Veneto AVEPA "Piano Utilizzo" format indicators
  // This format has specific columns like "1a Coltura", "Sup. Utilizzata", PAC codes
  const venetoAvepaIndicators = [
    'sup. catastale',
    '1a coltura',
    'sup. utilizzata',
    'parcella di rif',
    'potenz. irriguo',
    'presenza ciclo',
    'tipo con',
  ];
  const venetoAvepaMatches = venetoAvepaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Check for PAC code pattern in headers (columns with codes like "(870-011-000-000-000)")
  const hasPacCodePattern = headers.some(
    (h) => /\d{3}-\d{3}-\d{3}/.test(h) || /^\(\d{3}-\d{3}/.test(h.trim()),
  );

  // Veneto format indicators (similar to Piemonte but specific to Veneto)
  const venetoIndicators = [
    'comune descrizione',
    'superficie uso suolo primario',
    'superficie netta uso suolo primario',
  ];
  const venetoMatches = venetoIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Check if region/province indicates Veneto
  const hasVenetoRegion =
    headerText.includes('veneto') ||
    headerText.includes('verona') ||
    headerText.includes('vicenza') ||
    headerText.includes('venezia') ||
    headerText.includes('padova') ||
    headerText.includes('treviso') ||
    headerText.includes('rovigo') ||
    headerText.includes('belluno');

  // Piemonte format indicators
  const piemonteIndicators = [
    'unita produttiva',
    'comune descrizione',
    'occupazione suolo uso suolo primario',
    'superficie uso suolo primario',
    'epoca semina primario',
  ];
  const piemonteMatches = piemonteIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Lombardia format indicators
  const lombardiaIndicators = ['cuaa', 'supero', 'tipo utilizzo', 'coltivazione', 'mappale'];
  const lombardiaMatches = lombardiaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Emilia-Romagna format indicators
  const emiliaIndicators = [
    'id. domanda',
    'occupazione suolo',
    'foglio ',
    'superficie(ha)',
    'data inizio utilizzo',
  ];
  const emiliaMatches = emiliaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // CIA Schedario Viticolo format indicators
  const ciaIndicators = [
    'descrizione vitigno',
    'forma allevamento',
    'sup. vitata dichiarata',
    'codice vitigno',
    'numero ceppi',
    'unar',
  ];
  const ciaMatches = ciaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Check CIA Schedario Viticolo first (very distinctive format)
  if (ciaMatches >= 3) {
    return 'cia_schedario_viticolo';
  }

  // Check Veneto AVEPA first (it has distinctive columns)
  if (venetoAvepaMatches >= 3 || (venetoAvepaMatches >= 2 && hasPacCodePattern)) {
    return 'veneto_avepa';
  }

  // Check Veneto (before Piemonte since they're similar)
  if (venetoMatches >= 2 && hasVenetoRegion) return 'veneto';
  if (piemonteMatches >= 3) return 'piemonte';
  if (lombardiaMatches >= 3) return 'lombardia';
  if (emiliaMatches >= 3) return 'emilia_romagna';

  return 'unknown';
}

/**
 * Check if a row is empty
 */
export function isEmptyRow(row: (string | number)[]): boolean {
  if (!row) return true;
  return row.every((c) => c === '' || c === null || c === undefined);
}

/**
 * Convert detected headers and data back to ParsedRow format
 * Compatible with existing agent code
 */
export function convertToParseResult(detection: HeaderDetectionResult): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const rows = detection.rawRows.map((row) => {
    const record: Record<string, string> = {};
    detection.headers.forEach((header, idx) => {
      record[header] = String(row[idx] ?? '').trim();
    });
    return record;
  });

  return {
    headers: detection.headers,
    rows,
  };
}
