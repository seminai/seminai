import { LabelResistance } from './label.dto';
import type { RuleViolationDetail, DisciplinareActiveIngredientInfo } from './rule-rag.types';

/**
 * DTO for structured alert notes attached to a Job.
 * Contains extracted label data and LLM-selected values for regulatory compliance.
 */
export interface AlertNotesDTO {
  /** Hazard statements from label (e.g., EUH/H codes) */
  readonly frasi_pericolo: ReadonlyArray<string> | null;

  /** Application mode from label (e.g., "irrorazione", "nebulizzazione") */
  readonly modalita_applicazione: string | null;

  /** Maximum number of applications from label */
  readonly n_max_applicazioni: number | null;

  /** Unit of measure for max applications (e.g., "per anno", "per ciclo") */
  readonly n_max_applicazioni_um: string | null;

  /** Minimum dose from label */
  readonly dose_minima: number | null;

  /** Maximum dose from label */
  readonly dose_massima: number | null;

  /** Dose unit of measure from label */
  readonly dose_um: string | null;

  /** Maximum water volume from label */
  readonly acqua_max: number | null;

  /** Water volume unit of measure from label */
  readonly acqua_max_um: string | null;

  /** Application timing from label */
  readonly epoca_impiego: string | null;

  /** Technical notes from label */
  readonly note_tecniche: string | null;

  /** Application timing selected by LLM */
  readonly epoca_impiego_llm: string | null;

  /** Buffer zones and drift mitigation from label */
  readonly fasce_di_rispetto_e_deriva: ReadonlyArray<string> | null;

  /** Buffer zone for water bodies from label */
  readonly fasce_rispetto_acqua: string | null;

  /** Buffer zone for other crops from label */
  readonly fasce_rispetto_colture: string | null;

  /** Buffer zones selected by LLM */
  readonly fasce_di_rispetto_e_deriva_llm: string | null;

  /** Crops for off-season application from label */
  readonly colture_target_fuori_periodo_di_produzione: ReadonlyArray<string> | null;

  /** Off-season crop selected by LLM */
  readonly colture_target_fuori_periodo_di_produzione_llm: string | null;

  /** Resistance management info from label */
  readonly resistenze: ReadonlyArray<LabelResistance> | null;

  /** Resistance management selected by LLM */
  readonly resistenze_llm: string | null;

  /** Diseases/targets from label */
  readonly malattie: ReadonlyArray<string> | null;

  /** Total stock required for all jobs of this product */
  readonly total_stock_required_for_jobs: number | null;

  /** Unit of measure for total stock required */
  readonly total_stock_required_for_jobs_um: string | null;

  /** Stock out amount (negative balance) */
  readonly stock_out: number | null;

  /** Stock out unit of measure */
  readonly stock_out_um: string | null;

  /** Total stock available in warehouse for this product */
  readonly stock_in_warehouse: number | null;

  /** Unit of measure for stock in warehouse */
  readonly stock_in_warehouse_um: string | null;

  /** Whether DDT date is conformant */
  readonly ddt_date_is_ok: boolean | null;

  /** DDT date conformity details */
  readonly ddt_date_conformity: string | null;

  /** True when DDT date is after the planned treatment date (product not yet available) */
  readonly ddt_date_after_treatment: boolean | null;

  /** Total water in hectoliters for the job (acqua_max * treatedSurface / 100) */
  readonly waterHlJob: number | null;

  /** Maximum water converted to job unit (acqua_max * treatedSurface) */
  readonly acquaMaxJob: number | null;

  /** Unit of measure for acquaMaxJob (e.g., "L") */
  readonly acquaMaxJob_um: string | null;

  /** Active ingredient from label */
  readonly principio_attivo: string | null;

  /** Minimum dose in hectoliters for the job (only if dose unit is fluid: L, ml) */
  readonly dose_minima_hl_job: number | null;

  /** Maximum dose in hectoliters for the job (only if dose unit is fluid: L, ml) */
  readonly dose_massima_hl_job: number | null;

  /** Violations of company rules from vectorized PDFs */
  readonly ruleViolations: ReadonlyArray<RuleViolationDetail> | null;

  /** Textual notes about rule compliance */
  readonly ruleComplianceNotes: string | null;

  /** Structured disciplinare info for the active ingredient(s) in this product */
  readonly disciplinare_info: ReadonlyArray<DisciplinareActiveIngredientInfo> | null;
}

/**
 * Creates an AlertNotesDTO with all fields set to null.
 */
export function createEmptyAlertNotes(): AlertNotesDTO {
  return {
    frasi_pericolo: null,
    modalita_applicazione: null,
    n_max_applicazioni: null,
    n_max_applicazioni_um: null,
    dose_minima: null,
    dose_massima: null,
    dose_um: null,
    acqua_max: null,
    acqua_max_um: null,
    epoca_impiego: null,
    note_tecniche: null,
    epoca_impiego_llm: null,
    fasce_di_rispetto_e_deriva: null,
    fasce_rispetto_acqua: null,
    fasce_rispetto_colture: null,
    fasce_di_rispetto_e_deriva_llm: null,
    colture_target_fuori_periodo_di_produzione: null,
    colture_target_fuori_periodo_di_produzione_llm: null,
    resistenze: null,
    resistenze_llm: null,
    malattie: null,
    total_stock_required_for_jobs: null,
    total_stock_required_for_jobs_um: null,
    stock_out: null,
    stock_out_um: null,
    stock_in_warehouse: null,
    stock_in_warehouse_um: null,
    ddt_date_is_ok: null,
    ddt_date_conformity: null,
    ddt_date_after_treatment: null,
    waterHlJob: null,
    acquaMaxJob: null,
    acquaMaxJob_um: null,
    principio_attivo: null,
    dose_minima_hl_job: null,
    dose_massima_hl_job: null,
    ruleViolations: null,
    ruleComplianceNotes: null,
    disciplinare_info: null,
  };
}
