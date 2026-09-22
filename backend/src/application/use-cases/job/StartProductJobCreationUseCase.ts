import {
  ProductJobCreationQueue,
  ProductJobCreationJobData,
} from '../../../infrastructure/queue/ProductJobCreationQueue';
import { BulkCreateJobItemDTO } from './BulkCreateProductAndJobUseCase';
import { DosageAgentJobState } from '../../../domain/entities/DosageAgentJob';
import { IDosageAgentJobRepository } from '../../../domain/repositories/IDosageAgentJobRepository';

/**
 * Input per avviare un job di creazione prodotti/interventi asincrono
 */
export interface StartProductJobCreationInput {
  readonly items: BulkCreateJobItemDTO[];
  readonly userId: string;
}

/**
 * Output dell'avvio del job
 */
export interface StartProductJobCreationOutput {
  readonly jobId: string;
}

/**
 * Use case per avviare la creazione di prodotti/interventi in modo asincrono
 * quando le unità produttive non sono specificate e devono essere risolte.
 */
export class StartProductJobCreationUseCase {
  constructor(
    private readonly productJobCreationQueue: ProductJobCreationQueue,
    private readonly dosageAgentJobRepository: IDosageAgentJobRepository,
  ) {}

  async execute(input: StartProductJobCreationInput): Promise<StartProductJobCreationOutput> {
    const jobData: ProductJobCreationJobData = {
      items: input.items,
      userId: input.userId,
    };

    const jobId = await this.productJobCreationQueue.addJob(jobData);

    await this.dosageAgentJobRepository.updateStatus({
      jobId,
      userId: input.userId,
      state: DosageAgentJobState.QUEUED,
      progress: 0,
      failedReason: null,
      name: 'Creazione Interventi',
    });

    return { jobId };
  }
}
