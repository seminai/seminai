import type { ComplianceStatus, DisciplinareEvidence, EvidenceSource, LabelEvidence, PlanStep } from '../type/plan';
import { AgronomicEvidenceViolation, AppliedRuleLike, DisciplinareInfoLike, DoseDetailLike, LabelCacheEntryLike, LabelLike, UNKNOWN } from './treatment-evidence-builder.part-01-dose-detail-like';

export function buildEvidenceVerdict(
  step: PlanStep,
  label: LabelEvidence,
  disciplinare: DisciplinareEvidence,
  derogationStatus: string,
): { status: ComplianceStatus; reasons: string[] } {
  const reasons = [
    label.status === 'verified' ? 'Etichetta verificata.' : 'Etichetta mancante o incompleta.',
    disciplinare.status === 'verified'
      ? 'Disciplinare/regole verificati.'
      : 'Disciplinare/regole da verificare.',
    derogationStatus === 'found'
      ? 'Deroga/bollettino presente.'
      : 'Deroghe/bollettini non verificati.',
  ];
  if (step.compliance.status === 'non_conforme' || disciplinare.status === 'conflict') {
    return { status: 'non_conforme', reasons };
  }
  if (
    label.status !== 'verified' ||
    disciplinare.status !== 'verified' ||
    derogationStatus !== 'found'
  ) {
    return { status: 'da_verificare', reasons };
  }
  return { status: 'conforme', reasons };
}

export function buildSources(
  label: LabelEvidence,
  disciplinare: DisciplinareEvidence,
  derogationStatus: string,
  agronomicViolations: readonly AgronomicEvidenceViolation[] | undefined,
  step: PlanStep,
): EvidenceSource[] {
  const sources: EvidenceSource[] = [];
  if (label.status === 'verified') sources.push({ type: 'label', label: label.source });
  for (const ruleName of disciplinare.ruleNames)
    sources.push({ type: 'disciplinare', label: ruleName });
  if (derogationStatus === 'found')
    sources.push({ type: 'derogation', label: 'Deroga/bollettino' });
  const matchingViolations = (agronomicViolations ?? []).filter((violation) =>
    matchesText(violation.product ?? violation.productName, step.treatment.productName),
  );
  for (const violation of matchingViolations) {
    sources.push({
      type: 'agronomic_validation',
      label: violation.code ?? 'Validazione agronomica',
      detail: violation.message,
    });
  }
  return sources;
}

export function findLabelEntry(
  step: PlanStep,
  cache?: Record<string, unknown>,
): LabelCacheEntryLike | null {
  if (!cache) return null;
  const registration = step.treatment.registrationNumber;
  const direct = registration ? toLabelEntry(cache[registration]) : null;
  if (direct) return direct;
  return (
    Object.values(cache)
      .map(toLabelEntry)
      .find((entry) =>
        Boolean(entry && matchesText(entry.productName, step.treatment.productName)),
      ) ?? null
  );
}

export function toLabelEntry(value: unknown): LabelCacheEntryLike | null {
  if (!value || typeof value !== 'object') return null;
  return value as LabelCacheEntryLike;
}

export function findDoseDetail(label: LabelLike, step: PlanStep): DoseDetailLike | null {
  return (
    label.dosaggi_dettagliati?.find(
      (detail) =>
        matchesText(detail.coltura, step.treatment.cropName) &&
        (!step.treatment.adversity || matchesText(detail.malattia, step.treatment.adversity)),
    ) ?? null
  );
}

export function findDisciplinareInfos(step: PlanStep, value: unknown): DisciplinareInfoLike[] {
  return getMatchedMapValues(value, [step.treatment.activeIngredient, step.treatment.cropName]);
}

export function findAppliedRules(step: PlanStep, value: unknown): AppliedRuleLike[] {
  return getMatchedMapValues(value, [step.treatment.productionUnitId, step.treatment.productName]);
}

export function getMatchedMapValues<T>(value: unknown, tokens: ReadonlyArray<string | undefined>): T[] {
  if (!(value instanceof Map)) return [];
  const normalizedTokens = tokens
    .map((token) => normalize(token ?? ''))
    .filter((token): token is string => Boolean(token));
  const result: T[] = [];
  for (const [key, raw] of value.entries()) {
    const normalizedKey = normalize(String(key));
    if (!normalizedTokens.every((token) => normalizedKey.includes(token))) continue;
    result.push(...((Array.isArray(raw) ? raw : [raw]) as T[]));
  }
  return result;
}

export function formatDoseRange(detail: DoseDetailLike | null): string {
  if (!detail) return UNKNOWN;
  const min = detail.dose_minima;
  const max = detail.dose_massima;
  const unit = detail.dose_um ?? '';
  if (min !== undefined && min !== null && max !== undefined && max !== null)
    return `${min}-${max} ${unit}`.trim();
  if (min !== undefined && min !== null) return `${min} ${unit}`.trim();
  if (max !== undefined && max !== null) return `${max} ${unit}`.trim();
  return UNKNOWN;
}

export function formatMaxApplications(detail: DoseDetailLike | null): string {
  if (!detail?.n_max_applicazioni) return UNKNOWN;
  return `${detail.n_max_applicazioni} ${detail.n_max_applicazioni_um ?? ''}`.trim();
}

export function formatDisciplinareApplications(infos: readonly DisciplinareInfoLike[]): string {
  return (
    infos
      .map((info) =>
        [
          formatOptionalNumber(info.n_max_interventi_sa, info.n_max_interventi_sa_scope ?? ''),
          formatOptionalNumber(
            info.n_max_interventi_gruppo,
            info.n_max_interventi_gruppo_scope ?? '',
          ),
        ]
          .filter((item) => item !== UNKNOWN)
          .join(' / '),
      )
      .filter(Boolean)
      .join('; ') || UNKNOWN
  );
}

export function formatOptionalNumber(value: number | null | undefined, suffix: string): string {
  if (value === undefined || value === null) return UNKNOWN;
  return `${value} ${suffix}`.trim();
}

export function includesText(
  values: readonly string[] | undefined,
  text: string | undefined,
): boolean | null {
  if (!text) return null;
  if (!values?.length) return null;
  return values.some((value) => matchesText(value, text));
}

export function matchesText(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalize(left ?? '');
  const b = normalize(right ?? '');
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

export function normalize(value: string): string {
  return value.trim().toLowerCase();
}
