import { LabelDoseDetail } from '../../../domain/dtos/label.dto';

export const normalizeReg = (v: string): string =>
  String(v || '')
    .trim()
    .replace(/^0+/, '');

export function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter((s) => s.length > 0);
  return [];
}

export function normalizeSpeciesName(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  if (lower === 'salsefrica') return 'Salsefrica';
  if (
    lower === 'floreali' ||
    lower === 'ornamentali' ||
    lower.includes('alberi') ||
    lower.includes('arbusti')
  ) {
    return 'Floreali e ornamentali (inclusi alberi e arbusti)';
  }
  return raw.replace(/\s+/g, ' ');
}

export function deduplicatePreservingOrder(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
    }
  }
  return result;
}

export function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseRange(value: unknown): { min: number | null; max: number | null } {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      if (Number.isFinite(min) && Number.isFinite(max)) {
        return { min, max };
      }
    }
    const singleNum = toOptionalNumber(trimmed);
    if (singleNum != null) {
      return { min: singleNum, max: singleNum };
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { min: value, max: value };
  }
  return { min: null, max: null };
}

export function coerceDosaggiDettagliati(value: unknown): ReadonlyArray<LabelDoseDetail> {
  if (!Array.isArray(value)) return [];
  const output: Array<LabelDoseDetail> = [];
  for (const v of value) {
    const obj = typeof v === 'object' && v ? (v as Record<string, unknown>) : {};
    const coltura = typeof obj['coltura'] === 'string' ? (obj['coltura'] as string) : '';
    const malattia =
      typeof obj['malattia'] === 'string' || obj['malattia'] === null
        ? (obj['malattia'] as string | null) ?? null
        : null;
    const dose_minima = toOptionalNumber(obj['dose_minima']);
    const dose_massima = toOptionalNumber(obj['dose_massima']);
    const dose_um =
      typeof obj['dose_um'] === 'string' || obj['dose_um'] === null
        ? (obj['dose_um'] as string | null) ?? null
        : null;
    const acqua_max = toOptionalNumber(obj['acqua_max']);
    const acqua_max_um =
      typeof obj['acqua_max_um'] === 'string' || obj['acqua_max_um'] === null
        ? (obj['acqua_max_um'] as string | null) ?? null
        : null;
    const n_max_applicazioni = toOptionalNumber(obj['n_max_applicazioni']);
    const n_max_applicazioni_um =
      typeof obj['n_max_applicazioni_um'] === 'string' || obj['n_max_applicazioni_um'] === null
        ? (obj['n_max_applicazioni_um'] as string | null) ?? null
        : null;
    const intervallo_min_giorni = toOptionalNumber(obj['intervallo_min_giorni']);
    const intervallo_sicurezza_giorni = toOptionalNumber(obj['intervallo_sicurezza_giorni']);
    const epoca_impiego =
      typeof obj['epoca_impiego'] === 'string' || obj['epoca_impiego'] === null
        ? (obj['epoca_impiego'] as string | null) ?? null
        : null;
    const modalita_applicazione =
      typeof obj['modalita_applicazione'] === 'string' || obj['modalita_applicazione'] === null
        ? (obj['modalita_applicazione'] as string | null) ?? null
        : null;
    const istruzioni =
      typeof obj['istruzioni'] === 'string' || obj['istruzioni'] === null
        ? (obj['istruzioni'] as string | null) ?? null
        : null;
    if (
      !coltura &&
      dose_minima == null &&
      dose_massima == null &&
      n_max_applicazioni == null &&
      intervallo_min_giorni == null &&
      intervallo_sicurezza_giorni == null &&
      !epoca_impiego &&
      !modalita_applicazione &&
      !malattia
    ) {
      continue;
    }
    const finalDetail: LabelDoseDetail = {
      coltura,
      malattia,
      dose_minima,
      dose_massima,
      dose_um,
      acqua_max,
      acqua_max_um,
      ...(n_max_applicazioni != null ? { n_max_applicazioni } : {}),
      ...(n_max_applicazioni_um ? { n_max_applicazioni_um } : {}),
      intervallo_min_giorni,
      intervallo_sicurezza_giorni,
      epoca_impiego,
      modalita_applicazione,
      istruzioni,
    };
    if (coltura && coltura.includes(',')) {
      const crops = coltura
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      for (const crop of crops) {
        output.push({ ...finalDetail, coltura: crop });
      }
    } else {
      output.push(finalDetail);
    }
  }
  return output;
}
