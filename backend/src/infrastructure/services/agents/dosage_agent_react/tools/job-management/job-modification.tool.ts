import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { JobCategory } from '@prisma/client';
import { IJobRepository } from '../../../../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../../../../domain/repositories/IStockRepository';
import { UpdateJobUseCase } from '../../../../../../application/use-cases/job/UpdateJobUseCase';
import { CreateJobUseCase } from '../../../../../../application/use-cases/job/CreateJobUseCase';
import { ModifyingUserInfo } from '../../../../../../domain/dtos/job-modification.dto';
import { CreateStockProps } from '../../../../../../domain/dtos/stock.dto';

/**
 * Options required by job modification tools (update, create, merge).
 */
export interface JobModificationToolOptions {
  readonly userId: string;
  readonly userInfo: { name: string; email: string };
  readonly jobRepository: IJobRepository;
  readonly stockRepository: IStockRepository;
}

const stockSchema = z.object({
  productId: z.string().describe('Product UUID'),
  quantity: z.number().describe('Quantity of product used'),
  unitOfMeasureQuantity: z.string().describe('Unit of measure (e.g. kg, L, g)'),
  price: z.number().optional().describe('Unit price'),
  unitOfMeasurePrice: z.string().optional().describe('Price unit (e.g. EUR/kg)'),
  type: z.string().describe('Stock movement type (e.g. USAGE)'),
  companySupplierName: z.string().nullable().optional().describe('Supplier company name'),
});

/**
 * Tool: update_job
 * Updates an existing job. DESTRUCTIVE — requires user approval.
 */
export const createUpdateJobTool = (options: JobModificationToolOptions): DynamicStructuredTool => {
  const { userId, userInfo, jobRepository, stockRepository } = options;
  const useCase = new UpdateJobUseCase(jobRepository, stockRepository);

  return new DynamicStructuredTool({
    name: 'update_job',
    description: `Modifica un job agricolo esistente (trattamento, semina, fertilizzazione).
⚠️ RICHIEDE APPROVAZIONE DELL'UTENTE.
Usa per: correggere dosaggio, cambiare data, aggiornare avversità, modificare note o stock.
IMPORTANTE: usa search_job_operations o get_job_details PRIMA per trovare il job ID corretto.
Il campo "reason" è obbligatorio e viene registrato nello storico del job.`,
    schema: z.object({
      jobId: z.string().describe('UUID del job da aggiornare'),
      reason: z
        .string()
        .describe('Giustificazione obbligatoria. Registrata nello storico del job.'),
      quantity: z.number().optional().describe('Nuova quantità'),
      unitOfMeasureQuantity: z.string().optional().describe('Unità di misura quantità'),
      dateOfOpeation: z
        .string()
        .optional()
        .describe('Nuova data operazione in ISO 8601 (es. 2025-06-15T00:00:00.000Z)'),
      avversity: z.string().nullable().optional().describe('Avversità / parassita target'),
      modeOfApplication: z
        .string()
        .nullable()
        .optional()
        .describe('Modalità applicazione (es. irrorazione, fertirrigazione)'),
      giustification: z.string().nullable().optional().describe('Giustificazione agronomica'),
      treatedSurface: z.number().nullable().optional().describe('Superficie trattata (ha)'),
      isLocalizedTreatment: z.boolean().nullable().optional(),
      totalDistributedWaterL: z.number().nullable().optional().describe('Acqua distribuita (L)'),
      note: z.string().nullable().optional().describe('Nota libera'),
      stocks: z
        .array(stockSchema)
        .optional()
        .describe('Stock sostitutivi. Se forniti, sostituiscono TUTTI gli stock esistenti.'),
    }),
    func: async (input) => {
      try {
        const existing = await jobRepository.findById(input.jobId);
        if (!existing) {
          return 'ERROR: Job non trovato. Usa search_job_operations o get_job_details per selezionare l’operazione corretta.';
        }

        const modifiedBy: ModifyingUserInfo = {
          userId,
          name: userInfo.name,
          email: userInfo.email,
        };
        const { jobId, reason, stocks, ...fieldsToUpdate } = input;
        const dateValue = fieldsToUpdate.dateOfOpeation
          ? new Date(fieldsToUpdate.dateOfOpeation)
          : undefined;

        const stocksToPass: CreateStockProps[] | undefined = stocks?.map(
          (s: {
            productId: string;
            quantity: number;
            unitOfMeasureQuantity: string;
            price?: number;
            unitOfMeasurePrice?: string;
            type: string;
            companySupplierName?: string | null;
          }) => ({
            productId: s.productId,
            quantity: s.quantity,
            unitOfMeasureQuantity: s.unitOfMeasureQuantity,
            price: s.price ?? 0,
            unitOfMeasurePrice: s.unitOfMeasurePrice ?? '',
            type: s.type,
            companySupplierName: s.companySupplierName ?? null,
            jobId,
          }),
        );

        const { job: updated } = await useCase.execute({
          id: jobId,
          modifiedBy,
          reason,
          data: {
            ...fieldsToUpdate,
            ...(dateValue ? { dateOfOpeation: dateValue } : {}),
            ...(stocks !== undefined ? { stocks: stocksToPass } : {}),
          },
        });

        return `JOB AGGIORNATO:
Categoria: ${updated.category}
Data: ${updated.dateOfOpeation.toLocaleDateString('it-IT')}
Quantità: ${updated.quantity} ${updated.unitOfMeasureQuantity}
Avversità: ${updated.avversity ?? 'N/A'}
Note: ${updated.note ?? 'N/A'}
Reason: "${reason}"
Modificato da: ${userInfo.name} (${userInfo.email})`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `ERROR aggiornamento job: ${msg}`;
      }
    },
  });
};

/**
 * Tool: create_job
 * Creates a new agricultural job. DESTRUCTIVE — requires user approval.
 */
export const createAddJobTool = (options: JobModificationToolOptions): DynamicStructuredTool => {
  const { jobRepository, stockRepository } = options;
  const useCase = new CreateJobUseCase(jobRepository, stockRepository);

  return new DynamicStructuredTool({
    name: 'create_job',
    description: `Crea un nuovo job agricolo (TREATMENT, SEEDING, FERTILIZATION).
⚠️ RICHIEDE APPROVAZIONE DELL'UTENTE.
Richiede productionUnitId dal contesto. Usa get_job_details o list_production_units per ottenerlo.`,
    schema: z.object({
      productionUnitId: z.string().describe('UUID unità produttiva'),
      productionCycleId: z.string().nullable().optional().describe('UUID ciclo produttivo'),
      category: z.nativeEnum(JobCategory).describe('Categoria: TREATMENT, SEEDING, FERTILIZATION'),
      dateOfOpeation: z.string().describe('Data operazione ISO 8601'),
      quantity: z.number().describe('Quantità prodotto applicato'),
      unitOfMeasureQuantity: z.string().describe('Unità di misura (es. kg/ha, L/ha)'),
      avversity: z.string().nullable().optional(),
      modeOfApplication: z.string().nullable().optional(),
      giustification: z.string().nullable().optional(),
      treatedSurface: z.number().nullable().optional(),
      isLocalizedTreatment: z.boolean().nullable().optional(),
      totalDistributedWaterL: z.number().nullable().optional(),
      note: z.string().nullable().optional(),
      machineId: z.string().nullable().optional(),
      userId: z.string().nullable().optional(),
      jobId: z
        .string()
        .nullable()
        .optional()
        .describe('Group ID per collegare al dosage agent run'),
      stocks: z.array(stockSchema).optional(),
    }),
    func: async (input) => {
      try {
        const stocksToPass: CreateStockProps[] | undefined = input.stocks?.map(
          (s: {
            productId: string;
            quantity: number;
            unitOfMeasureQuantity: string;
            price?: number;
            unitOfMeasurePrice?: string;
            type: string;
            companySupplierName?: string | null;
          }) => ({
            productId: s.productId,
            quantity: s.quantity,
            unitOfMeasureQuantity: s.unitOfMeasureQuantity,
            price: s.price ?? 0,
            unitOfMeasurePrice: s.unitOfMeasurePrice ?? '',
            type: s.type,
            companySupplierName: s.companySupplierName ?? null,
          }),
        );

        const { job: created } = await useCase.execute({
          productionUnitId: input.productionUnitId,
          productionCycleId: input.productionCycleId ?? null,
          category: input.category,
          dateOfOpeation: new Date(input.dateOfOpeation),
          quantity: input.quantity,
          unitOfMeasureQuantity: input.unitOfMeasureQuantity,
          avversity: input.avversity ?? null,
          modeOfApplication: input.modeOfApplication ?? null,
          giustification: input.giustification ?? null,
          treatedSurface: input.treatedSurface ?? null,
          isLocalizedTreatment: input.isLocalizedTreatment ?? null,
          totalDistributedWaterL: input.totalDistributedWaterL ?? null,
          note: input.note ?? null,
          machineId: input.machineId ?? null,
          userId: input.userId ?? null,
          jobId: input.jobId ?? null,
          stocks: stocksToPass,
        });

        return `JOB CREATO:
Categoria: ${created.category}
Data: ${created.dateOfOpeation.toLocaleDateString('it-IT')}
Quantità: ${created.quantity} ${created.unitOfMeasureQuantity}
Avversità: ${created.avversity ?? 'N/A'}
Unità Produttiva: selezionata`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `ERROR creazione job: ${msg}`;
      }
    },
  });
};
