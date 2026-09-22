import { InputDosageAgent } from '../services/agents/dosage_agent';
import { UnitAllowedProductsOutput, UnitAllowedProductsWithDosageOutput } from '../services/agents/dosage_agent/flowMatchCropTreatment';
import { StockBalanceReport } from '../services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { CompressedData } from '../utils/redis-compression.util';
import { PrismaDosageAgentJobRepository } from '../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../repositories/Prisma';
import { StoredJobResultReference } from '../services/dosage-job-result-storage.service';


export const LOCK_DURATION_MS = 1_800_000;
 // 30 minuti
export const LOCK_RENEW_TIME_MS = 240_000;
 // 4 minuti
export const STALLED_INTERVAL_MS = 240_000;
 // 4 minuti

export interface DosageAgentJobData {
  input: InputDosageAgent;
  userId: string;
}


export interface DosageAgentJobResult {
  outcome: ReadonlyArray<UnitAllowedProductsOutput>;
  outcomeWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  stockBalance: StockBalanceReport;
}


export interface ExternalDosageAgentJobResult {
  readonly externalResult: StoredJobResultReference;
  readonly outcomeCount: number;
  readonly outcomeWithDosageCount: number;
  readonly stockBalanceProductsCount: number;
}


export const QUEUE_NAME = 'dosage-agent';


export const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);


export type DosageAgentJobReturnValue =
  | DosageAgentJobResult
  | CompressedData<DosageAgentJobResult>
  | ExternalDosageAgentJobResult;
