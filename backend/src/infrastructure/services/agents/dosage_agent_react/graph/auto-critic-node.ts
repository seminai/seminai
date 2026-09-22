import { SystemMessage, ToolMessage } from '@langchain/core/messages';
import { DosageReactState } from '../type/state';

/** Tools whose outputs are sanity-checked for dosage anomalies */
export const CRITIC_TARGET_TOOLS = new Set<string>([
  'calculate_dosage',
  'validate_compliance',
  'validate_sa_group_limits',
  'optimize_dosage',
  'create_company',
  'create_fields',
  'create_production_units',
  'create_treatment_jobs',
  'execute_treatment_plan',
  'update_job',
  'confirm_conformity_check',
]);

/** Max dose per hectare considered normal (kg/L per ha) */
const DOSE_PER_HA_MAX = 100;

/** Min dose per hectare (negative doses are invalid) */
const DOSE_PER_HA_MIN = 0;

interface TreatmentLike {
  readonly dose?: number;
  readonly dosePerHa?: number;
  readonly dose_ha?: number;
}

interface ProductLike {
  readonly treatments?: readonly TreatmentLike[];
  readonly trattamenti?: readonly TreatmentLike[];
}

interface UnitLike {
  readonly products?: readonly ProductLike[];
}

/**
 * Extracts all dose-per-hectare values from dosage results or summary structures.
 */
function extractDoseValues(parsed: Record<string, unknown>): number[] {
  const doses: number[] = [];
  const arr =
    (parsed.dosageResults as UnitLike[] | undefined) ??
    (parsed.outcomeWithDosage as UnitLike[] | undefined) ??
    (parsed.summary as UnitLike[] | undefined);
  if (!Array.isArray(arr)) return doses;
  for (const unit of arr) {
    const products = unit.products ?? [];
    for (const product of products) {
      const treatments = product.treatments ?? product.trattamenti ?? [];
      for (const t of treatments) {
        const dose =
          (t as TreatmentLike).dosePerHa ??
          (t as TreatmentLike).dose ??
          (t as TreatmentLike).dose_ha;
        if (typeof dose === 'number') doses.push(dose);
      }
    }
  }
  return doses;
}

/**
 * Finds anomalous doses (negative or > 100).
 */
function findAnomalousDoses(doses: number[]): Array<{ dose: number; index: number }> {
  const anomalies: Array<{ dose: number; index: number }> = [];
  doses.forEach((d, i) => {
    if (d < DOSE_PER_HA_MIN || d > DOSE_PER_HA_MAX) {
      anomalies.push({ dose: d, index: i });
    }
  });
  return anomalies;
}

/**
 * Checks domain-specific rules for expanded tool coverage.
 * Returns a warning string if an issue is detected, or undefined if OK.
 */
function checkDomainRules(toolName: string, parsed: Record<string, unknown>): string | undefined {
  // Job creation: check treatment dates are not in the past
  if (toolName === 'create_treatment_jobs' || toolName === 'execute_treatment_plan') {
    const jobs = (parsed.jobs ?? parsed.createdJobs ?? []) as Array<Record<string, unknown>>;
    const now = Date.now();
    const pastDates = jobs.filter((j) => {
      const dateStr = (j.applicationDate ?? j.date ?? j.treatmentDate) as string | undefined;
      if (!dateStr) return false;
      return new Date(dateStr).getTime() < now - 24 * 60 * 60 * 1000;
    });
    if (pastDates.length > 0) {
      return `ATTENZIONE (${toolName}): ${pastDates.length} trattamento/i con data nel passato. Verifica le date prima di procedere.`;
    }
  }
  // Job update: check dose changes don't exceed 2x original
  if (toolName === 'update_job') {
    const originalDose = parsed.originalDose as number | undefined;
    const newDose = parsed.newDose as number | undefined;
    if (originalDose && newDose && newDose > originalDose * 2) {
      return `ATTENZIONE (${toolName}): la nuova dose (${newDose}) è più del doppio della dose originale (${originalDose}). Verifica i dati.`;
    }
  }
  // Conformity: check that proposals have severity
  if (toolName === 'confirm_conformity_check') {
    const proposals = (parsed.proposals ?? []) as Array<Record<string, unknown>>;
    const missingSeverity = proposals.filter((p) => !p.severity);
    if (missingSeverity.length > 0) {
      return `ATTENZIONE (${toolName}): ${missingSeverity.length} proposta/e senza classificazione di severità. Verifica prima di applicare.`;
    }
  }
  return undefined;
}

/**
 * Creates a graph node that sanity-checks computational tool outputs.
 * Injects a warning SystemMessage when dosage anomalies are detected.
 *
 * @returns Async function compatible with DosageReactState graph nodes
 */
export function createAutoCriticNode(): (
  state: DosageReactState,
) => Promise<Partial<DosageReactState>> {
  return async (state: DosageReactState): Promise<Partial<DosageReactState>> => {
    const messages = state.messages;
    if (messages.length === 0) return {};
    const lastMessage = messages[messages.length - 1];
    if (!(lastMessage instanceof ToolMessage)) return {};
    const toolName = lastMessage.name ?? '';
    if (!toolName || !CRITIC_TARGET_TOOLS.has(toolName)) return {};
    const content = lastMessage.content;
    if (typeof content !== 'string') return {};
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return {};
    }
    if ('error' in parsed && parsed.error != null) return {};
    // Dosage anomaly check (original tools)
    const doses = extractDoseValues(parsed);
    if (doses.length > 0) {
      const anomalies = findAnomalousDoses(doses);
      if (anomalies.length > 0) {
        const details = anomalies
          .slice(0, 5)
          .map((a) => `dose ${a.dose} (pos. ${a.index + 1})`)
          .join(', ');
        const truncated = anomalies.length > 5 ? `... e altri ${anomalies.length - 5}` : '';
        const warning = new SystemMessage(
          `ATTENZIONE: rilevata anomalia nei risultati (${toolName}): ${details}${truncated}. ` +
            `Valori attesi: dose/ha tra ${DOSE_PER_HA_MIN} e ${DOSE_PER_HA_MAX}. Verifica i dati prima di procedere.`,
        );
        return { messages: [warning] };
      }
    }
    // Domain-specific checks for expanded tool coverage
    const domainWarning = checkDomainRules(toolName, parsed);
    if (domainWarning) {
      return { messages: [new SystemMessage(domainWarning)] };
    }
    return {};
  };
}
