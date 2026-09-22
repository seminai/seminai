/** Risk level derived from score thresholds */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Result of risk classification for a tool invocation.
 */
export interface RiskClassification {
  /** Computed risk score (0–100+) */
  score: number;
  /** Human-readable risk level */
  level: RiskLevel;
  /** Brief explanation of the classification */
  reason: string;
}

/** Base risk scores for write-side-effect tools. Keys must match tool names. */
export const BASE_RISK_SCORES: Record<string, number> = {
  create_treatment_jobs: 35,
  execute_treatment_plan: 35,
  create_company: 35,
  create_fields: 35,
  create_production_units: 35,
  update_production_units: 35,
  import_from_file: 40,
  import_stock_from_file: 35,
  approve_field_note: 35,
  update_job: 35,
  create_job: 35,
  merge_treatment_dates: 35,
  optimize_selected_jobs: 35,
  confirm_conformity_check: 35,
  start_dosage_agent_job: 35,
  create_workspace_rule: 35,
  update_workspace_rule: 35,
  archive_workspace_rule: 35,
  schedule_alert: 35,
  // Sales module: persistent writes always require approval.
  create_business_partner: 35,
  create_sales_order: 35,
  confirm_sales_order: 35,
  generate_ddt: 35,
  cancel_ddt: 35,
  import_sales_order_from_template: 35,
  generate_proforma: 35,
} as const;

/** Explicit allow-list for tools with no persistent write side effects. */
export const LOW_RISK_SCORES: Record<string, number> = {
  check_product_revoked: 5,
  expand_production_cycles: 5,
  extract_buffer_zones: 5,
  enrich_from_bdf: 5,
  calculate_stock_balance: 5,
  search_products: 5,
  calculate_dosage: 5,
  validate_compliance: 5,
  validate_sa_group_limits: 5,
  validate_agronomic_plan: 5,
  check_compatibility: 5,
  plan_treatment_strategy: 5,
  optimize_dosage: 5,
  fertilizer_plan: 5,
  generate_treatment_plan: 5,
  modify_plan_step: 5,
  list_existing_job_groups: 5,
  plan_task: 5,
  get_working_memory_details: 5,
  list_user_companies: 5,
  list_production_units: 5,
  list_company_products: 5,
  list_done_operations: 5,
  list_unverified_operations: 5,
  ask_user_questions: 5,
  delegate_to_field_note: 5,
  reject_field_note: 5,
  search_product_label_database: 5,
  diagnose_from_photo: 5,
  recommend_best_products: 5,
  create_dosage_pdf: 5,
  list_user_fields: 5,
  extract_from_file: 5,
  normalize_extraction: 5,
  present_extraction_review: 5,
  check_extraction_status: 5,
  list_user_workspaces: 5,
  list_workspace_rules: 5,
  run_conformity_check: 5,
  search_company_stock_products: 5,
  check_product_crop_authorizations: 5,
  get_weather_forecast: 5,
  evaluate_treatment_window: 5,
  // QDC (Quaderno di Campagna) read-only tools.
  qdc_list_companies: 5,
  qdc_get_operations: 5,
  qdc_get_giacenze: 5,
  tavily_scientific_search: 5,
  search_rules: 5,
  search_disciplinari_database: 5,
  search_disciplinari_bdf_pdf: 5,
  bdf_search_product_doses: 5,
  bdf_search_products_by_adversity: 5,
  search_job_operations: 5,
  get_job_details: 5,
  spawn_subagent: 5,
  // Embedded form-editor chat tools emit patches to local draft state only.
  propose_set_unit_fields: 5,
  propose_add_unit: 5,
  propose_remove_unit: 5,
  propose_move_allocation: 5,
  // Sales module read-only tools.
  search_business_partners: 5,
  list_sales_orders: 5,
  check_product_availability: 5,
  get_ddt: 5,
  preview_order_template: 5,
} as const;

const UNKNOWN_TOOL_RISK_SCORE = 50;

/** Score thresholds for risk levels */
const LOW_THRESHOLD = 30;
const MEDIUM_THRESHOLD = 70;

/**
 * Classifies the risk of executing a tool with the given arguments.
 *
 * @param toolName - Name of the tool being invoked
 * @param args - Tool arguments (may contain jobIds, selectedJobIds, overwrite, replacePdfFromChat)
 * @returns Risk classification with score, level, and reason
 */
export function classifyRisk(toolName: string, args: Record<string, unknown>): RiskClassification {
  const reasons: string[] = [];
  const hasWriteScore = Object.prototype.hasOwnProperty.call(BASE_RISK_SCORES, toolName);
  const hasLowScore = Object.prototype.hasOwnProperty.call(LOW_RISK_SCORES, toolName);
  let score = hasWriteScore
    ? BASE_RISK_SCORES[toolName]!
    : hasLowScore
      ? LOW_RISK_SCORES[toolName]!
      : UNKNOWN_TOOL_RISK_SCORE;

  if (!hasWriteScore && !hasLowScore) {
    reasons.push('unknown tool; approval required by default');
  }

  // Quantity factor: bulk operations increase risk
  const jobIds = (args.jobIds ?? args.selectedJobIds) as unknown[] | undefined;
  const arrLength = Array.isArray(jobIds) ? jobIds.length : 0;
  if (arrLength > 50) {
    score += 40;
    reasons.push(`bulk operation (${arrLength} items)`);
  } else if (arrLength > 20) {
    score += 25;
    reasons.push(`bulk operation (${arrLength} items)`);
  }

  // Irreversibility factor: overwrite/replace operations
  const overwrite = args.overwrite as boolean | undefined;
  const replacePdf = args.replacePdfFromChat as boolean | undefined;
  if (overwrite === true || replacePdf === true) {
    score += 30;
    reasons.push('irreversible overwrite');
  }

  const reason = reasons.length > 0 ? reasons.join('; ') : `base score for ${toolName}`;

  let level: RiskLevel;
  if (score < LOW_THRESHOLD) {
    level = 'low';
  } else if (score <= MEDIUM_THRESHOLD) {
    level = 'medium';
  } else {
    level = 'high';
  }

  return { score, level, reason };
}

/**
 * Returns true if the classification indicates the action can be auto-approved.
 * Only low-risk actions are auto-approved.
 *
 * @param classification - Result from classifyRisk
 * @returns true if level is 'low'
 */
export function shouldAutoApprove(classification: RiskClassification): boolean {
  return classification.level === 'low';
}

/**
 * Adapter that exposes the dosage risk classifier as a shared RiskPolicy.
 * Used by the generic HITL approve/reject functions for auto-continue decisions.
 */
export const dosageRiskPolicy: import('../../shared/hitl/risk-policy').RiskPolicy = {
  classify: classifyRisk,
  requiresApproval: (name, args) => !shouldAutoApprove(classifyRisk(name, args)),
};
