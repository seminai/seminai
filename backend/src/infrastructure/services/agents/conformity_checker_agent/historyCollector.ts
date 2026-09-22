import { JobHistoryManager } from '../dosage_agent/historyCollector';

/**
 * Steps specific to conformity checking, extending the dosage agent's history tracking.
 */
export const ConformityCheckStep = {
  REVOCATION_CHECK: 'revocation_check',
  SA_GROUP_CHECK: 'sa_group_check',
  RULES_COMPLIANCE_CHECK: 'rules_compliance_check',
  BUFFER_ZONE_CHECK: 'buffer_zone_check',
  CONFORMITY_SUMMARY: 'conformity_summary',
  SINGLE_JOB_CHECK: 'single_job_check',
} as const;

export type ConformityCheckStepType =
  (typeof ConformityCheckStep)[keyof typeof ConformityCheckStep];

/**
 * Data sources used by conformity checker
 */
export const ConformityDataSource = {
  LABEL: 'LABEL',
  BDF_DATABASE: 'BDF_DATABASE',
  MINISTERIAL_DATASET: 'MINISTERIAL_DATASET',
  RULES_RAG: 'RULES_RAG',
  BUFFER_ZONE_LLM: 'BUFFER_ZONE_LLM',
  SYSTEM: 'SYSTEM',
} as const;

export type ConformityDataSourceType =
  (typeof ConformityDataSource)[keyof typeof ConformityDataSource];

/**
 * Creates a new JobHistoryManager instance scoped to a conformity check run.
 */
export function createConformityHistoryManager(): JobHistoryManager {
  return new JobHistoryManager();
}

export { JobHistoryManager };
