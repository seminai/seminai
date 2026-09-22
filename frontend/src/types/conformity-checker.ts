export interface StartConformityCheckJobRequest {
  readonly jobGroupId: string;
  readonly notes?: string;
}

export interface StartConformityCheckJobResponse {
  readonly status: string;
  readonly data: {
    readonly jobId: string;
    readonly message: string;
  };
}

export interface ConformityCheckSummary {
  readonly totalJobs: number;
  readonly conformJobs: number;
  readonly nonConformJobs: number;
  readonly jobsToExclude: number;
  readonly totalViolations: number;
  readonly errorCount: number;
  readonly warningCount: number;
}

export type ConformityViolationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ConformityViolationView {
  readonly type: string;
  readonly message: string;
  readonly severity: ConformityViolationSeverity;
}

export interface ConformityProposalValues {
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
}

/**
 * Mirror of backend JobOptimizationProposal restricted to the fields
 * needed to render and confirm proposals in the FE.
 * Kept as Record-friendly so it can be passed as-is to /confirm.
 */
export interface ConformityProposal {
  readonly jobId: string;
  readonly productionUnitId: string;
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly isConform: boolean;
  readonly violations: readonly ConformityViolationView[];
  readonly originalValues: ConformityProposalValues;
  readonly proposedValues: ConformityProposalValues;
  readonly shouldExclude: boolean;
  readonly exclusionReason?: string;
}

export interface ConformityCheckResult {
  readonly jobGroupId: string;
  readonly summary?: ConformityCheckSummary;
  readonly proposals?: readonly ConformityProposal[];
  readonly warnings?: readonly string[];
  readonly checkedAt?: string;
}

export interface ConformityJobCompletedEvent {
  readonly jobId: string;
  readonly message?: string;
  readonly state?: string;
  readonly progress?: number;
  readonly result?: ConformityCheckResult;
  readonly failedReason?: string;
}

export interface ConfirmConformityProposalsRequest {
  readonly jobGroupId: string;
  readonly jobIds?: readonly string[];
  readonly proposals: readonly ConformityProposal[];
}

export interface ConfirmConformityProposalsResponse {
  readonly status: string;
  readonly data: {
    readonly jobGroupId: string;
    readonly updatedJobsCount: number;
    readonly excludedJobsCount: number;
    readonly errorCount: number;
    readonly updatedJobIds: readonly string[];
  };
}
