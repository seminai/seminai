import type {
  ComplianceStatus,
  DisciplinareEvidence,
  EvidenceSource,
  LabelEvidence,
  PlanStep,
  TreatmentEvidence,
} from '../type/plan';

interface DoseDetailLike {
  readonly coltura?: string | null;
  readonly malattia?: string | null;
  readonly dose_minima?: number | null;
  readonly dose_massima?: number | null;
  readonly dose_um?: string | null;
  readonly n_max_applicazioni?: number | null;
  readonly n_max_applicazioni_um?: string | null;
  readonly intervallo_min_giorni?: number | null;
  readonly intervallo_sicurezza_giorni?: number | null;
  readonly epoca_impiego?: string | null;
  readonly modalita_applicazione?: string | null;
}

interface LabelLike {
  readonly principio_attivo?: string | null;
  readonly meccanismo_azione_frac?: string | null;
  readonly colture_target?: readonly string[];
  readonly malattie?: readonly string[];
  readonly dosaggi_dettagliati?: readonly DoseDetailLike[];
  readonly fasce_rispetto_acqua?: string | null;
  readonly fasce_rispetto_colture?: string | null;
  readonly note_tecniche?: string | null;
}

interface LabelCacheEntryLike {
  readonly productName?: string;
  readonly registrationNumber?: string;
  readonly label?: LabelLike;
}

interface DisciplinareInfoLike {
  readonly dosaggi?: string | null;
  readonly n_max_interventi_sa?: number | null;
  readonly n_max_interventi_sa_scope?: string | null;
  readonly n_max_interventi_gruppo?: number | null;
  readonly n_max_interventi_gruppo_scope?: string | null;
  readonly gruppo_sostanze_attive?: readonly string[];
  readonly limitazioni_uso_e_note?: string | null;
}

interface AppliedRuleLike {
  readonly ruleName?: string;
  readonly isCompliant?: boolean;
  readonly citations?: ReadonlyArray<{ readonly snippet?: string; readonly page?: number }>;
}

export interface AgronomicEvidenceViolation {
  readonly code?: string;
  readonly severity?: string;
  readonly product?: string;
  readonly productName?: string;
  readonly message?: string;
}

export interface TreatmentEvidenceInput {
  readonly labelCache?: Record<string, unknown>;
  readonly complianceResult?: {
    readonly disciplinareInfoMap?: unknown;
    readonly appliedRulesByProduct?: unknown;
  };
  readonly agronomicViolations?: readonly AgronomicEvidenceViolation[];
}

export interface TreatmentEvidenceSummary {
  readonly step: number;
  readonly productName: string;
  readonly label: string;
  readonly disciplinare: string;
  readonly derogations: string;
  readonly verdict: ComplianceStatus;
  readonly sources: readonly string[];
}

const UNKNOWN = 'DA VERIFICARE';

export function attachTreatmentEvidence(
  steps: readonly PlanStep[],
  input: TreatmentEvidenceInput,
): PlanStep[] {
  return steps.map((step) => {
    const evidence = buildTreatmentEvidence(step, input);
    return {
      ...step,
      compliance: { ...step.compliance, status: evidence.verdict.status },
      evidence,
    };
  });
}

export function buildTreatmentEvidenceSummary(
  steps: readonly PlanStep[],
): TreatmentEvidenceSummary[] {
  return steps.map((step) => ({
    step: step.sequence,
    productName: step.treatment.productName,
    label: step.evidence?.label.doseRange ?? UNKNOWN,
    disciplinare: step.evidence?.disciplinare.doseLimit ?? UNKNOWN,
    derogations: step.evidence?.derogations.notes.join('; ') ?? UNKNOWN,
    verdict: step.evidence?.verdict.status ?? 'da_verificare',
    sources: step.evidence?.sources.map((source) => source.label) ?? [],
  }));
}

function buildTreatmentEvidence(step: PlanStep, input: TreatmentEvidenceInput): TreatmentEvidence {
  const label = buildLabelEvidence(step, input.labelCache);
  const disciplinare = buildDisciplinareEvidence(step, input.complianceResult);
  const derogations = buildDerogationEvidence(disciplinare);
  const verdict = buildEvidenceVerdict(step, label, disciplinare, derogations.status);
  const sources = buildSources(
    label,
    disciplinare,
    derogations.status,
    input.agronomicViolations,
    step,
  );
  return { label, disciplinare, derogations, verdict, sources };
}

function buildLabelEvidence(step: PlanStep, cache?: Record<string, unknown>): LabelEvidence {
  const entry = findLabelEntry(step, cache);
  const label = entry?.label;
  if (!label) {
    return {
      status: 'missing',
      source: UNKNOWN,
      doseRange: UNKNOWN,
      maxApplications: UNKNOWN,
      minIntervalDays: UNKNOWN,
      phiDays: UNKNOWN,
      cropAuthorized: null,
      adversityAuthorized: null,
      bufferLimitations: UNKNOWN,
      notes: ['Etichetta non presente in labelCache: usare BDF/SIAN o verificare manualmente.'],
    };
  }
  const detail = findDoseDetail(label, step);
  return {
    status: detail ? 'verified' : 'missing',
    source: 'Etichetta ministeriale DB',
    doseRange: formatDoseRange(detail),
    maxApplications: formatMaxApplications(detail),
    minIntervalDays: formatOptionalNumber(detail?.intervallo_min_giorni, 'giorni'),
    phiDays: formatOptionalNumber(detail?.intervallo_sicurezza_giorni, 'giorni'),
    cropAuthorized: includesText(label.colture_target, step.treatment.cropName),
    adversityAuthorized: detail ? true : includesText(label.malattie, step.treatment.adversity),
    bufferLimitations:
      [label.fasce_rispetto_acqua, label.fasce_rispetto_colture].filter(Boolean).join(' | ') ||
      UNKNOWN,
    notes: [detail?.epoca_impiego, detail?.modalita_applicazione, label.note_tecniche].filter(
      (note): note is string => Boolean(note),
    ),
  };
}

function buildDisciplinareEvidence(
  step: PlanStep,
  complianceResult?: TreatmentEvidenceInput['complianceResult'],
): DisciplinareEvidence {
  const infos = findDisciplinareInfos(step, complianceResult?.disciplinareInfoMap);
  const rules = findAppliedRules(step, complianceResult?.appliedRulesByProduct);
  const hasEvidence = infos.length > 0 || rules.length > 0;
  const violations = step.compliance.violations.map((violation) => violation.message);
  return {
    status: hasEvidence
      ? step.compliance.status === 'non_conforme'
        ? 'conflict'
        : 'verified'
      : 'missing',
    ruleNames: rules.map((rule) => rule.ruleName).filter((name): name is string => Boolean(name)),
    doseLimit:
      infos
        .map((info) => info.dosaggi)
        .filter(Boolean)
        .join('; ') || UNKNOWN,
    maxApplications: formatDisciplinareApplications(infos),
    activeIngredientGroups: [
      ...new Set(infos.flatMap((info) => info.gruppo_sostanze_attive ?? [])),
    ],
    limitations: [
      ...infos
        .map((info) => info.limitazioni_uso_e_note)
        .filter((note): note is string => Boolean(note)),
      ...violations,
    ],
    complianceStatus: hasEvidence ? step.compliance.status : 'da_verificare',
  };
}

function buildDerogationEvidence(disciplinare: DisciplinareEvidence) {
  const haystack = [...disciplinare.ruleNames, ...disciplinare.limitations].join(' ').toLowerCase();
  if (haystack.includes('deroga') || haystack.includes('bollett')) {
    return {
      status: 'found' as const,
      notes: ['Deroga/bollettino citato nelle regole applicate.'],
    };
  }
  return {
    status: 'not_verified' as const,
    notes: [
      'Nessun controllo automatico completo su bollettini/deroghe: verificare fonte regionale.',
    ],
  };
}

function buildEvidenceVerdict(
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

function buildSources(
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

function findLabelEntry(
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

function toLabelEntry(value: unknown): LabelCacheEntryLike | null {
  if (!value || typeof value !== 'object') return null;
  return value as LabelCacheEntryLike;
}

function findDoseDetail(label: LabelLike, step: PlanStep): DoseDetailLike | null {
  return (
    label.dosaggi_dettagliati?.find(
      (detail) =>
        matchesText(detail.coltura, step.treatment.cropName) &&
        (!step.treatment.adversity || matchesText(detail.malattia, step.treatment.adversity)),
    ) ?? null
  );
}

function findDisciplinareInfos(step: PlanStep, value: unknown): DisciplinareInfoLike[] {
  return getMatchedMapValues(value, [step.treatment.activeIngredient, step.treatment.cropName]);
}

function findAppliedRules(step: PlanStep, value: unknown): AppliedRuleLike[] {
  return getMatchedMapValues(value, [step.treatment.productionUnitId, step.treatment.productName]);
}

function getMatchedMapValues<T>(value: unknown, tokens: ReadonlyArray<string | undefined>): T[] {
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

function formatDoseRange(detail: DoseDetailLike | null): string {
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

function formatMaxApplications(detail: DoseDetailLike | null): string {
  if (!detail?.n_max_applicazioni) return UNKNOWN;
  return `${detail.n_max_applicazioni} ${detail.n_max_applicazioni_um ?? ''}`.trim();
}

function formatDisciplinareApplications(infos: readonly DisciplinareInfoLike[]): string {
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

function formatOptionalNumber(value: number | null | undefined, suffix: string): string {
  if (value === undefined || value === null) return UNKNOWN;
  return `${value} ${suffix}`.trim();
}

function includesText(
  values: readonly string[] | undefined,
  text: string | undefined,
): boolean | null {
  if (!text) return null;
  if (!values?.length) return null;
  return values.some((value) => matchesText(value, text));
}

function matchesText(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalize(left ?? '');
  const b = normalize(right ?? '');
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
