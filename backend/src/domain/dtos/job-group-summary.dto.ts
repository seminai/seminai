/**
 * DTO representing a summary of jobs grouped by jobId
 */
export interface JobGroupSummaryDTO {
  readonly jobId: string;
  readonly createdAt: Date;
  readonly company: {
    readonly id: string;
    readonly name: string;
  };
  readonly totalOperations: number;
  readonly verifiedOperations: number;
  readonly pendingOperations: number;
}
