import type { Label, LabelDoseDetail } from '../../../../../domain/dtos/label.dto';

export interface LabelDoseFact {
  readonly crop: string;
  readonly adversity: string | null;
  readonly dose: string;
  readonly timing: string | null;
  readonly applicationMode: string | null;
  readonly instructions: string | null;
  readonly phiDays: number | null;
  readonly maxApplications: string | null;
  readonly minIntervalDays: number | null;
  readonly waterVolume: string | null;
}

export interface LabelBufferFacts {
  readonly water: string | null;
  readonly crops: string | null;
  readonly drift: readonly string[];
  readonly status: 'found' | 'not_found';
  readonly message: string;
}

export interface LabelSourceFacts {
  readonly source: 'etichetta_ministeriale_db';
  readonly registrationNumber: string | null;
  readonly lastRefreshedAt: string | null;
  readonly freshness: 'fresh' | 'stale' | 'unknown';
}

export interface LabelFacts {
  readonly productName: string;
  readonly activeIngredient: string | null;
  readonly cropFilter: string | null;
  readonly doseFacts: readonly LabelDoseFact[];
  readonly bufferFacts: LabelBufferFacts;
  readonly warnings: readonly string[];
  readonly hazardStatements: readonly string[];
  readonly targetCrops: readonly string[];
  readonly source: LabelSourceFacts;
}

export interface ExtractLabelFactsInput {
  readonly label: Label;
  readonly productName?: string;
  readonly registrationNumber?: string;
  readonly cropName?: string | null;
  readonly lastRefreshedAt?: Date | string | null;
  readonly freshness?: 'fresh' | 'stale' | 'unknown';
}

const DEFAULT_LIMIT = 5;

export function extractLabelFacts(input: ExtractLabelFactsInput): LabelFacts {
  const cropFilter = cleanText(input.cropName);
  const doseFacts = filterDoseDetails(input.label.dosaggi_dettagliati, cropFilter)
    .slice(0, DEFAULT_LIMIT)
    .map(toDoseFact);
  const bufferFacts = buildBufferFacts(input.label);
  return {
    productName: input.productName ?? input.label.prodotto ?? 'Prodotto',
    activeIngredient: input.label.principio_attivo,
    cropFilter,
    doseFacts,
    bufferFacts,
    warnings: input.label.avvertenze.slice(0, 5),
    hazardStatements: input.label.frasi_pericolo.slice(0, 5),
    targetCrops: input.label.colture_target.slice(0, 12),
    source: {
      source: 'etichetta_ministeriale_db',
      registrationNumber: input.registrationNumber ?? input.label.numero_registrazione ?? null,
      lastRefreshedAt: formatDate(input.lastRefreshedAt),
      freshness: input.freshness ?? 'unknown',
    },
  };
}

export function formatLabelFactsForUser(facts: LabelFacts): string {
  const lines = [`Dati disponibili da etichetta per **${facts.productName}**${formatCrop(facts)}.`];
  if (facts.doseFacts.length > 0) {
    lines.push(`- Dosi: ${facts.doseFacts.map(formatDoseFact).join('; ')}.`);
  } else {
    lines.push(
      '- Dosi: nessuna riga specifica trovata per la coltura richiesta nei dati etichetta.',
    );
  }
  const phiValues = uniqueValues(
    facts.doseFacts
      .map((dose) => dose.phiDays)
      .filter((value): value is number => typeof value === 'number'),
  );
  if (phiValues.length > 0) {
    lines.push(`- PHI/carenza: ${phiValues.map((value) => `${value} giorni`).join(', ')}.`);
  }
  lines.push(`- Fasce di rispetto: ${formatBufferFacts(facts.bufferFacts)}.`);
  if (facts.warnings.length > 0) {
    lines.push(`- Avvertenze principali: ${facts.warnings.slice(0, 3).join(' ')}`);
  }
  lines.push(
    `Fonte: ${facts.source.source}${formatRegistration(facts.source.registrationNumber)}.`,
  );
  return lines.join('\n');
}

function filterDoseDetails(
  details: readonly LabelDoseDetail[],
  cropFilter: string | null,
): readonly LabelDoseDetail[] {
  if (!cropFilter) return details;
  const normalizedFilter = normalize(cropFilter);
  const filtered = details.filter((detail) => {
    const crop = normalize(detail.coltura);
    return crop.includes(normalizedFilter) || normalizedFilter.includes(crop);
  });
  return filtered.length > 0 ? filtered : details;
}

function toDoseFact(detail: LabelDoseDetail): LabelDoseFact {
  return {
    crop: detail.coltura,
    adversity: detail.malattia ?? null,
    dose: formatDoseRange(detail),
    timing: detail.epoca_impiego ?? null,
    applicationMode: detail.modalita_applicazione ?? null,
    instructions: detail.istruzioni ?? null,
    phiDays: detail.intervallo_sicurezza_giorni ?? null,
    maxApplications: formatMaxApplications(detail),
    minIntervalDays: detail.intervallo_min_giorni ?? null,
    waterVolume: formatWaterVolume(detail),
  };
}

function buildBufferFacts(label: Label): LabelBufferFacts {
  const water = cleanText(label.fasce_rispetto_acqua);
  const crops = cleanText(label.fasce_rispetto_colture);
  const drift = label.fasce_di_rispetto_e_deriva.filter((item) => item.trim().length > 0);
  const hasFacts = Boolean(water || crops || drift.length > 0);
  return {
    water,
    crops,
    drift,
    status: hasFacts ? 'found' : 'not_found',
    message: hasFacts
      ? 'Fasce presenti nei dati estratti.'
      : "Nessuna fascia di rispetto esplicita trovata nei campi estratti dell'etichetta.",
  };
}

function formatDoseRange(detail: LabelDoseDetail): string {
  const unit = detail.dose_um ? ` ${detail.dose_um}` : '';
  const min = detail.dose_minima;
  const max = detail.dose_massima;
  if (typeof min === 'number' && typeof max === 'number') {
    return min === max ? `${min}${unit}` : `${min}-${max}${unit}`;
  }
  const value = typeof max === 'number' ? max : min;
  return typeof value === 'number' ? `${value}${unit}` : 'N/D';
}

function formatMaxApplications(detail: LabelDoseDetail): string | null {
  if (typeof detail.n_max_applicazioni !== 'number') return null;
  return `${detail.n_max_applicazioni}${detail.n_max_applicazioni_um ? ` ${detail.n_max_applicazioni_um}` : ''}`;
}

function formatWaterVolume(detail: LabelDoseDetail): string | null {
  if (typeof detail.acqua_max !== 'number') return null;
  return `${detail.acqua_max}${detail.acqua_max_um ? ` ${detail.acqua_max_um}` : ''}`;
}

function formatDoseFact(fact: LabelDoseFact): string {
  const parts = [fact.timing, fact.dose, fact.adversity ? `target ${fact.adversity}` : null].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(' · ');
}

function formatBufferFacts(facts: LabelBufferFacts): string {
  if (facts.status === 'not_found') return facts.message;
  return [
    facts.water ? `acqua: ${facts.water}` : null,
    facts.crops ? `colture: ${facts.crops}` : null,
    ...facts.drift,
  ]
    .filter((part): part is string => Boolean(part))
    .join('; ');
}

function formatCrop(facts: LabelFacts): string {
  return facts.cropFilter ? ` su **${facts.cropFilter}**` : '';
}

function formatRegistration(registrationNumber: string | null): string {
  return registrationNumber ? `, reg. ${registrationNumber}` : '';
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function uniqueValues(values: readonly number[]): readonly number[] {
  return [...new Set(values)];
}
