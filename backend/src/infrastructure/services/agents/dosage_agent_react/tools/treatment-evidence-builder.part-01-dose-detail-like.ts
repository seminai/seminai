import type { ComplianceStatus, DisciplinareEvidence, LabelEvidence, PlanStep, TreatmentEvidence } from '../type/plan';
import { buildEvidenceVerdict, buildSources, findAppliedRules, findDisciplinareInfos, findDoseDetail, findLabelEntry, formatDisciplinareApplications, formatDoseRange, formatMaxApplications, formatOptionalNumber, includesText } from './treatment-evidence-builder.part-02-build-evidence-verdict';

export interface DoseDetailLike {
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

export interface LabelLike {
  readonly principio_attivo?: string | null;
  readonly meccanismo_azione_frac?: string | null;
  readonly colture_target?: readonly string[];
  readonly malattie?: readonly string[];
  readonly dosaggi_dettagliati?: readonly DoseDetailLike[];
  readonly fasce_rispetto_acqua?: string | null;
  readonly fasce_rispetto_colture?: string | null;
  readonly note_tecniche?: string | null;
}

export interface LabelCacheEntryLike {
  readonly productName?: string;
  readonly registrationNumber?: string;
  readonly label?: LabelLike;
}

export interface DisciplinareInfoLike {
  readonly dosaggi?: string | null;
  readonly n_max_interventi_sa?: number | null;
  readonly n_max_interventi_sa_scope?: string | null;
  readonly n_max_interventi_gruppo?: number | null;
  readonly n_max_interventi_gruppo_scope?: string | null;
  readonly gruppo_sostanze_attive?: readonly string[];
  readonly limitazioni_uso_e_note?: string | null;
}

export interface AppliedRuleLike {
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

export const UNKNOWN = 'DA VERIFICARE';

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

export function buildTreatmentEvidence(step: PlanStep, input: TreatmentEvidenceInput): TreatmentEvidence {
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

export function buildLabelEvidence(step: PlanStep, cache?: Record<string, unknown>): LabelEvidence {
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

export function buildDisciplinareEvidence(
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

export function buildDerogationEvidence(disciplinare: DisciplinareEvidence) {
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
