import { confirmConformityCheck } from '../services/agents/conformity_checker_agent';
import { ConformityCheckInput, ConformityCheckOutput, ConfirmConformityCheckInput, ConfirmConformityCheckOutput } from '../services/agents/conformity_checker_agent/types';
import { CompressedData } from '../utils/redis-compression.util';
import { PrismaDosageAgentJobRepository } from '../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../repositories/Prisma';


export const LOCK_DURATION_MS = 600_000;
 // 10 minuti (meno del dosage agent, è più veloce)
export const LOCK_RENEW_TIME_MS = 120_000;
 // 2 minuti
export const STALLED_INTERVAL_MS = 120_000;
 // 2 minuti

/**
 * Dati del job per il controllo di conformità
 */
export interface ConformityCheckerJobData {
  readonly input: ConformityCheckInput;
  readonly userId: string;
  readonly companyId?: string;
}


/**
 * Risultato del job di controllo conformità
 */
export type ConformityCheckerJobResult = ConformityCheckOutput;


export const QUEUE_NAME = 'conformity-checker';


export const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);


export type ConformityCheckerJobReturnValue =
  | ConformityCheckerJobResult
  | CompressedData<ConformityCheckerJobResult>;


/**
 * Conferma le proposte di conformità (sincrono)
 */
export async function confirmConformityProposals(
  input: ConfirmConformityCheckInput,
): Promise<ConfirmConformityCheckOutput> {
  return confirmConformityCheck(input);
}
