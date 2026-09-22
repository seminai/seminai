import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { JobCategory } from '@prisma/client';
import { IJobRepository } from '../../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../../domain/repositories/IStockRepository';
import { UpdateJobUseCase } from '../../../../application/use-cases/job/UpdateJobUseCase';
import { CreateJobUseCase } from '../../../../application/use-cases/job/CreateJobUseCase';
import { ModifyingUserInfo } from '../../../../domain/dtos/job-modification.dto';
import { CreateStockProps } from '../../../../domain/dtos/stock.dto';

/**
 * Options required by both job modification tools.
 */
export interface JobModificationToolOptions {
  readonly userId: string;
  readonly userInfo: { name: string; email: string };
  readonly jobRepository: IJobRepository;
  readonly stockRepository: IStockRepository;
}

/** Zod schema for a stock item when creating/updating a job. */
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
 * Creates a tool that updates an existing job based on AI-assisted user requests.
 * All changes are tracked in the job history with full diff and user attribution.
 * When requireApproval is true this tool call is intercepted before execution.
 */
export const createUpdateJobTool = (options: JobModificationToolOptions): DynamicStructuredTool => {
  const { userId, userInfo, jobRepository, stockRepository } = options;
  const useCase = new UpdateJobUseCase(jobRepository, stockRepository);

  return new DynamicStructuredTool({
    name: 'update_job',
    description: `Updates an existing agricultural job (treatment, seeding, fertilization) based on the user request.
Use this tool when the user asks to modify specific fields of a job, such as:
- Correcting dosage or quantity
- Changing the date of operation
- Updating the adversity (target pest/disease)
- Modifying the application mode or treated surface
- Adding or changing notes
- Replacing the stock/product records

IMPORTANT:
1. Always use search_job_operations or get_job_details FIRST to find the correct job ID.
2. Validate the proposed change against disciplinari or company rules before calling this tool.
3. The "reason" field is mandatory and will be recorded in the job history.
4. Only include fields you actually want to change.`,
    schema: z.object({
      jobId: z.string().describe('UUID of the job to update'),
      reason: z
        .string()
        .describe(
          'Mandatory justification for the modification. Will be stored in job history (e.g. "User requested dose correction to comply with disciplinare Emilia-Romagna 2025 max 2.5 kg/ha")',
        ),
      quantity: z.number().optional().describe('New quantity value'),
      unitOfMeasureQuantity: z.string().optional().describe('Unit of measure for quantity'),
      dateOfOpeation: z
        .string()
        .optional()
        .describe('New operation date in ISO 8601 format (e.g. 2025-06-15T00:00:00.000Z)'),
      avversity: z.string().nullable().optional().describe('Adversity / target pest or disease'),
      modeOfApplication: z
        .string()
        .nullable()
        .optional()
        .describe('Application mode (e.g. irrorazione, fertirrigazione)'),
      giustification: z
        .string()
        .nullable()
        .optional()
        .describe('Agronomic justification for the treatment'),
      treatedSurface: z.number().nullable().optional().describe('Treated surface in hectares'),
      isLocalizedTreatment: z
        .boolean()
        .nullable()
        .optional()
        .describe('Whether this is a localized treatment'),
      totalDistributedWaterL: z
        .number()
        .nullable()
        .optional()
        .describe('Total distributed water in liters'),
      note: z.string().nullable().optional().describe('Free-text note for the job'),
      stocks: z
        .array(stockSchema)
        .optional()
        .describe(
          'Replacement stock records. If provided, ALL existing stocks for this job are deleted and replaced.',
        ),
    }),
    func: async (input) => {
      try {
        const existing = await jobRepository.findById(input.jobId);
        if (!existing) {
          return `ERROR: Job with ID "${input.jobId}" not found. Use search_job_operations or get_job_details to find the correct job ID.`;
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

        return `JOB UPDATED SUCCESSFULLY:
ID: ${updated.id}
Category: ${updated.category}
Date: ${updated.dateOfOpeation.toLocaleDateString('it-IT')}
Quantity: ${updated.quantity} ${updated.unitOfMeasureQuantity}
Adversity: ${updated.avversity ?? 'N/A'}
Note: ${updated.note ?? 'N/A'}
Reason recorded: "${reason}"
Modified by: ${userInfo.name} (${userInfo.email})`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `ERROR updating job: ${msg}`;
      }
    },
  });
};

/**
 * Creates a tool that adds a new agricultural job from AI-assisted user requests.
 * Requires productionUnitId which the agent must retrieve from existing job context.
 */
export const createAddJobTool = (options: JobModificationToolOptions): DynamicStructuredTool => {
  const { jobRepository, stockRepository } = options;
  const useCase = new CreateJobUseCase(jobRepository, stockRepository);

  return new DynamicStructuredTool({
    name: 'create_job',
    description: `Creates a new agricultural job (treatment, seeding, fertilization) as requested by the user.
Use this tool when the user asks to add a new operation that does not yet exist.

IMPORTANT:
1. Use get_job_details FIRST to retrieve the productionUnitId from an existing job in the same context.
2. Validate the proposed job against disciplinari or company rules before calling this tool.
3. Prefer the same productionUnitId as the existing jobs to keep operations grouped correctly.`,
    schema: z.object({
      productionUnitId: z
        .string()
        .describe('UUID of the production unit this job belongs to (from existing job context)'),
      productionCycleId: z
        .string()
        .nullable()
        .optional()
        .describe('UUID of the production cycle (optional)'),
      category: z
        .nativeEnum(JobCategory)
        .describe('Job category: TREATMENT, SEEDING, or FERTILIZATION'),
      dateOfOpeation: z
        .string()
        .describe('Operation date in ISO 8601 format (e.g. 2025-06-15T00:00:00.000Z)'),
      quantity: z.number().describe('Quantity of product applied'),
      unitOfMeasureQuantity: z.string().describe('Unit of measure (e.g. kg/ha, L/ha)'),
      avversity: z.string().nullable().optional().describe('Target adversity / pest / disease'),
      modeOfApplication: z
        .string()
        .nullable()
        .optional()
        .describe('Application mode (e.g. irrorazione, fertirrigazione)'),
      giustification: z
        .string()
        .nullable()
        .optional()
        .describe('Agronomic justification for the treatment'),
      treatedSurface: z.number().nullable().optional().describe('Treated surface in hectares'),
      isLocalizedTreatment: z.boolean().nullable().optional(),
      totalDistributedWaterL: z.number().nullable().optional(),
      note: z.string().nullable().optional(),
      machineId: z.string().nullable().optional().describe('Machine UUID (optional)'),
      userId: z.string().nullable().optional().describe('Operator user UUID (optional)'),
      jobId: z
        .string()
        .nullable()
        .optional()
        .describe('Group ID to link this job to a dosage agent run (optional)'),
      stocks: z
        .array(stockSchema)
        .optional()
        .describe('Product/stock records consumed in this job'),
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

        return `JOB CREATED SUCCESSFULLY:
ID: ${created.id}
Category: ${created.category}
Date: ${created.dateOfOpeation.toLocaleDateString('it-IT')}
Quantity: ${created.quantity} ${created.unitOfMeasureQuantity}
Adversity: ${created.avversity ?? 'N/A'}
Production Unit: ${created.productionUnitId}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `ERROR creating job: ${msg}`;
      }
    },
  });
};
