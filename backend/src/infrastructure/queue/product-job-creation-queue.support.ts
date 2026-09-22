import { CompressedData } from '../utils/redis-compression.util';
import { PrismaDosageAgentJobRepository } from '../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../repositories/Prisma';
import { UnmatchedProductWarning } from '../../application/services/ProductionUnitMatcherService';
import { BulkCreateJobItemDTO } from '../../application/use-cases/job/BulkCreateProductAndJobUseCase';


export const LOCK_DURATION_MS = 300_000;
 // 5 minuti
export const LOCK_RENEW_TIME_MS = 60_000;
 // 1 minuto
export const STALLED_INTERVAL_MS = 60_000;
 // 1 minuto

export const QUEUE_NAME = 'product-job-creation';


/**
 * Dati del job per la creazione prodotti/interventi
 */
export interface ProductJobCreationJobData {
  readonly items: BulkCreateJobItemDTO[];
  readonly userId: string;
}


/**
 * Risultato del job di creazione prodotti/interventi
 */
export interface ProductJobCreationJobResult {
  readonly jobs: unknown[];
  readonly jobProductLinks: unknown[];
  readonly warnings: UnmatchedProductWarning[];
}


export const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);


export type ProductJobCreationJobReturnValue =
  | ProductJobCreationJobResult
  | CompressedData<ProductJobCreationJobResult>;
