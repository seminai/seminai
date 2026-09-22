/**
 * Treatment Plan types for the Planning Agent.
 *
 * A TreatmentPlan is a structured, reviewable plan that the agent generates
 * before creating actual jobs. The user can review, modify individual steps,
 * and approve/reject before execution — similar to a "diff preview" pattern.
 */

// ── Plan Status Lifecycle ──

export type PlanStatus =
  | 'draft'
  | 'presented'
  | 'approved'
  | 'modified'
  | 'executing'
  | 'completed'
  | 'rejected';

export type PlanStepStatus = 'pending' | 'approved' | 'modified' | 'rejected' | 'executed';

export type ComplianceStatus = 'conforme' | 'non_conforme' | 'da_verificare';

export type ViolationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type EvidenceStatus = 'verified' | 'missing' | 'not_applicable' | 'conflict';

export type DerogationStatus = 'found' | 'not_found' | 'not_verified';

// ── Core Plan Interfaces ──

export interface TreatmentPlan {
  /** Unique plan identifier */
  id: string;
  /** Current plan status */
  status: PlanStatus;
  /** Plan metadata */
  metadata: PlanMetadata;
  /** Target production units */
  targets: PlanTarget[];
  /** Individual treatment steps */
  steps: PlanStep[];
  /** Overall compliance summary */
  compliance: PlanCompliance;
  /** Stock availability summary */
  stockSummary: PlanStockSummary;
  /** Aggregated token usage across all model calls */
  tokenUsage: PlanTokenUsage;
}

export interface PlanMetadata {
  createdAt: string;
  updatedAt?: string;
  userRequest: string;
  reasoning: string;
  /** Track which model was used for each operation */
  modelsUsed: ModelUsageEntry[];
}

export interface ModelUsageEntry {
  provider: string;
  model: string;
  step: string;
  inputTokens: number;
  outputTokens: number;
}

export interface PlanTarget {
  productionUnitId: string;
  productionUnitName: string;
  cropName: string;
  areaHa: number;
  region?: string;
}

export interface PlanStep {
  /** Unique step identifier */
  id: string;
  /** Step sequence (1-based) */
  sequence: number;
  /** Step status */
  status: PlanStepStatus;
  /** Treatment details */
  treatment: PlanTreatment;
  /** Per-step compliance check */
  compliance: StepCompliance;
  /** Label, rules, derogation and source evidence backing the proposed treatment */
  evidence?: TreatmentEvidence;
  /** Alternative products suggested by the agent */
  alternatives?: PlanAlternative[];
  /** User note on this step */
  userNote?: string;
}

export interface PlanTreatment {
  productionUnitId?: string;
  productionUnitName?: string;
  cropName?: string;
  areaHa?: number;
  productName: string;
  productId?: string;
  registrationNumber?: string;
  activeIngredient: string;
  adversity: string;
  dosePerHa: number;
  doseUnit: string;
  totalQuantity: number;
  totalQuantityUnit?: string;
  applicationDate: string;
  applicationMode?: string;
  safetyInterval?: number;
}

export interface StepCompliance {
  status: ComplianceStatus;
  violations: ComplianceViolation[];
  disciplinareSource?: string;
}

export interface TreatmentEvidence {
  label: LabelEvidence;
  disciplinare: DisciplinareEvidence;
  derogations: DerogationEvidence;
  verdict: EvidenceVerdict;
  sources: EvidenceSource[];
}

export interface LabelEvidence {
  status: EvidenceStatus;
  source: string;
  doseRange: string;
  maxApplications: string;
  minIntervalDays: string;
  phiDays: string;
  cropAuthorized: boolean | null;
  adversityAuthorized: boolean | null;
  bufferLimitations: string;
  notes: string[];
}

export interface DisciplinareEvidence {
  status: EvidenceStatus;
  ruleNames: string[];
  doseLimit: string;
  maxApplications: string;
  activeIngredientGroups: string[];
  limitations: string[];
  complianceStatus: ComplianceStatus;
}

export interface DerogationEvidence {
  status: DerogationStatus;
  notes: string[];
}

export interface EvidenceVerdict {
  status: ComplianceStatus;
  reasons: string[];
}

export interface EvidenceSource {
  type: 'label' | 'disciplinare' | 'derogation' | 'agronomic_validation';
  label: string;
  detail?: string;
  url?: string;
}

export interface ComplianceViolation {
  type?: string;
  message: string;
  severity: ViolationSeverity;
  source?: string;
}

export interface PlanAlternative {
  productName: string;
  reason: string;
  dosePerHa: number;
  doseUnit?: string;
}

export interface PlanCompliance {
  overallStatus: ComplianceStatus;
  totalSteps: number;
  conformSteps: number;
  nonConformSteps: number;
  warnings: string[];
}

export interface PlanStockSummary {
  hasIssues: boolean;
  products: PlanStockItem[];
}

export interface PlanStockItem {
  name: string;
  required: number;
  available: number;
  deficit: number;
  unit: string;
}

export interface PlanTokenUsage {
  totalInput: number;
  totalOutput: number;
  byProvider: Record<string, { input: number; output: number }>;
}

// ── Modification Tracking ──

export interface PlanModification {
  stepId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  modifiedAt: string;
  reason: string;
}
