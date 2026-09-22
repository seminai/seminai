/** Mirrors backend DosageStrategy from flowOptimizeDosageLineareFunc.ts */
export type DosageStrategy = 'min' | 'max' | 'avg' | 'current';

export type OrchestratorObjective =
  | 'minimize_interventions'
  | 'maximize_coverage'
  | 'balanced'
  | 'cost_effective';

export type OrchestratorIntensity = 'low' | 'medium' | 'high';

/** Mirrors backend OrchestratorConfig from dosage_agent/types.ts */
export interface OrchestratorConfig {
  readonly objective?: OrchestratorObjective;
  readonly intensity?: OrchestratorIntensity;
  readonly maxProductsPerUnit?: number;
  readonly maxApplicationsPerProductPerUnit?: number | null;
  readonly maxTotalJobs?: number;
  readonly allowOutsideProductionTreatments?: boolean;
  readonly categoryPriority?: readonly string[];
  readonly priorityTargets?: readonly string[];
  readonly agronomicNotes?: string;
  readonly useLlmForSelection?: boolean;
}

/** Product entry for dosage agent (mirrors FindLabelExtractionInputWithDosage) */
export interface PlanningProduct {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly quantity: number;
  readonly quantityUnitOfMeasure: string;
  readonly strategy?: DosageStrategy;
  readonly loadWarehouse?: boolean;
  readonly supplierName?: string;
  readonly supplierVat?: string;
  readonly treatedAreaHa?: number;
  readonly isLocalizedTreatment?: boolean;
  readonly targetStock?: number;
}

export interface OperationMachine {
  readonly companyId: string;
  readonly machineId: string;
}

export interface OperationOperator {
  readonly companyId: string;
  readonly userId: string;
}

export interface PlanningProductionUnitOption {
  readonly id: string;
  readonly name: string;
}

/** Payload for POST /dosage-agent/start-job */
export interface StartDosageJobRequest {
  readonly products: readonly PlanningProduct[];
  readonly unitOfProduction: readonly Record<string, unknown>[];
  readonly strategy?: DosageStrategy;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly outStockLimiter?: boolean;
  readonly orchestrator?: OrchestratorConfig;
  readonly operationMachines?: readonly OperationMachine[];
  readonly operationOperators?: readonly OperationOperator[];
}

export interface StartDosageJobResponse {
  readonly status: string;
  readonly data: {
    readonly jobId: string;
    readonly message: string;
  };
}

export interface DosageJobStatusResponse {
  readonly status: string;
  readonly data: {
    readonly id: string;
    readonly state: string;
    readonly progress: number;
    readonly stopPolling?: boolean;
    readonly message?: string;
  };
}

/** Mirrors backend DosageLogEvent from dosage-log-event.dto.ts */
export type DosageLogEventType =
  | 'info'
  | 'match'
  | 'match-fallback'
  | 'llm-match'
  | 'label-extraction'
  | 'sian'
  | 'flows'
  | 'flows-timing'
  | 'warning'
  | 'error'
  | 'progress'
  | 'completed';

export interface DosageLogEvent {
  readonly jobId: string;
  readonly userId: string;
  readonly timestamp: string;
  readonly type: DosageLogEventType;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

export type DosageAgentJobState =
  | 'queued'
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'stalled'
  | 'delayed'
  | 'not_found';

export interface DosageAgentJobListItem {
  readonly id: string;
  readonly userId: string;
  readonly state: DosageAgentJobState;
  readonly progress: number;
  readonly failedReason?: string;
  readonly processedOn?: string;
  readonly finishedOn?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly name?: string;
}

export interface DosageJobListResponse {
  readonly status: string;
  readonly data: readonly DosageAgentJobListItem[];
}

/** Row in the manual planning table */
export interface ManualPlanRow {
  readonly id: string;
  readonly productName: string;
  readonly registrationNumber: string;
  readonly quantity: number;
  readonly quantityUnitOfMeasure: string;
  readonly date: string;
  readonly productionUnitId?: string;
  readonly category?: string;
}

/** Config panel state for automatic planning */
export interface AutoPlanConfig {
  readonly strategy?: DosageStrategy;
  readonly orchestrator: OrchestratorConfig;
  readonly outStockLimiter: boolean;
  readonly startAt: string;
  readonly endAt: string;
  readonly machines: readonly OperationMachine[];
  readonly operators: readonly OperationOperator[];
}
