/**
 * Questo codice è da ottimizzare in quanto prevede la ricerca
 * vettoriale in qdrant di discplinari per regione
 */

export interface ApplicationLimits {
  maxApplications?: number;
  minIntervalDays?: number;
  source?: string;
  score?: number;
}

export interface DosageLimits {
  doseMin?: number;
  doseMax?: number;
  unitOfMeasure?: string;
  source?: string;
  score?: number;
}

export interface EnrichedQueryContext {
  readonly diseases: ReadonlyArray<string>;
  readonly agronomicNotes?: string;
  readonly priorityTargets?: ReadonlyArray<string>;
}

/**
 * Estrae la regione da un indirizzo
 */
export function extractRegionFromAddress(address: string): string | undefined {
  const regions = [
    'Abruzzo',
    'Basilicata',
    'Calabria',
    'Campania',
    'Emilia-Romagna',
    'Emilia Romagna',
    'Friuli-Venezia Giulia',
    'Friuli Venezia Giulia',
    'Lazio',
    'Liguria',
    'Lombardia',
    'Marche',
    'Molise',
    'Piemonte',
    'Puglia',
    'Sardegna',
    'Sicilia',
    'Toscana',
    'Trentino-Alto Adige',
    'Trentino Alto Adige',
    'Umbria',
    "Valle d'Aosta",
    'Veneto',
  ];
  const addressLower = address.toLowerCase();
  for (const region of regions) {
    if (addressLower.includes(region.toLowerCase())) {
      return region;
    }
  }
  return undefined;
}

export function extractDiseasesFromProduct(product: unknown): string[] {
  const label = (product as { label?: unknown }).label;
  if (!label || typeof label !== 'object') return [];
  const dosageDetails = (label as { dosaggi_dettagliati?: unknown[] }).dosaggi_dettagliati;
  if (!Array.isArray(dosageDetails)) return [];
  const diseases = dosageDetails
    .map((detail) => (detail as { malattia?: string }).malattia)
    .filter(
      (disease): disease is string => typeof disease === 'string' && disease.trim().length > 0,
    )
    .map((disease) => disease.trim());
  return [...new Set(diseases)];
}

export function buildEnrichedQueryContext(context: EnrichedQueryContext): string {
  const parts: string[] = [];
  if (context.diseases.length > 0) {
    parts.push(`Avversita target: ${context.diseases.join(', ')}`);
  }
  if (context.priorityTargets && context.priorityTargets.length > 0) {
    parts.push(`Target prioritari: ${context.priorityTargets.join(', ')}`);
  }
  if (context.agronomicNotes) {
    parts.push(`Note agronomiche: ${context.agronomicNotes}`);
  }
  return parts.join('. ');
}
