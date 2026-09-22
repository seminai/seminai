import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { JobCategory } from '@prisma/client';
import { CreateJobUseCase } from '../../../../../../application/use-cases/job/CreateJobUseCase';
import { IJobRepository } from '../../../../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../../../../domain/repositories/IStockRepository';
import { CreateStockProps } from '../../../../../../domain/dtos/stock.dto';
import { isFitoLabel, Label } from '../../../../../../domain/dtos/label.dto';
import { prisma } from '../../../../../repositories/Prisma';
import { mapEpocaToApplicationDates } from '../../../dosage_agent/bbchPhenologyMapper';
import {
  addDays,
  buildDistributedDates,
  clamp,
  diffDays,
  getCoverageHint,
  hasExplicitOptimizationIntent,
  pickDoseDetail,
  resolveConstraints,
  toIsoDate,
  toIsoDateTime,
} from './job-optimization-helpers';

export interface JobOptimizationToolOptions {
  readonly userId: string;
  readonly jobRepository: IJobRepository;
  readonly stockRepository: IStockRepository;
}

const optimizationSchema = z.object({
  selectedJobIds: z.array(z.string()).min(1).describe('Uno o più job ID da ottimizzare.'),
  optimizationRequest: z
    .string()
    .describe(
      'Intento di ottimizzazione. Es: "allarga fine fioritura e distribuisci in più giorni".',
    ),
  createNewJobs: z
    .boolean()
    .optional()
    .default(true)
    .describe('Se true, crea nuovi job ottimizzati; altrimenti restituisce solo il piano.'),
});

type OptimizationInput = z.infer<typeof optimizationSchema>;

/**
 * Tool: optimize_selected_jobs
 * Distributes treatment applications across multiple dates based on label/BDF constraints.
 * DESTRUCTIVE — requires user approval.
 */
export const createOptimizeSelectedJobsTool = (
  options: JobOptimizationToolOptions,
): DynamicStructuredTool => {
  const createJobUseCase = new CreateJobUseCase(options.jobRepository, options.stockRepository);
  return new DynamicStructuredTool({
    name: 'optimize_selected_jobs',
    description: `Ottimizza uno o più job distribuendo le applicazioni su più date.
⚠️ RICHIEDE APPROVAZIONE DELL'UTENTE.
Rispetta: intervallo minimo, finestra fenologica, N-max applicazioni da etichetta/BDF.
Complementare a optimize_dosage (che ottimizza dosi per stock).
Trigger: "ottimizza", "distribuisci", "spalma", "più giorni", "split", "finestra".`,
    schema: optimizationSchema,
    func: async (rawInput) => {
      const {
        selectedJobIds,
        optimizationRequest,
        createNewJobs = true,
      } = rawInput as OptimizationInput;
      if (!hasExplicitOptimizationIntent(optimizationRequest)) {
        return 'Nessun intento di ottimizzazione esplicito. Chiedi esplicitamente di ottimizzare/distribuire su più giorni.';
      }
      const jobs = await prisma.job.findMany({
        where: { id: { in: selectedJobIds } },
        include: {
          productionUnit: { include: { cycles: { orderBy: { seasonYear: 'desc' }, take: 1 } } },
          productionCycle: true,
          stocks: { include: { product: true } },
        },
      });
      if (!jobs.length) {
        return 'Nessuna operazione trovata per la selezione indicata.';
      }
      const operationLabelByJobId = new Map<string, string>(
        selectedJobIds.map((jobId, index): [string, string] => [jobId, `Operazione ${index + 1}`]),
      );
      const createdJobs: Array<{
        operation: string;
        date: string;
        quantity: number;
      }> = [];
      const reports: string[] = [];
      for (const job of jobs) {
        const operationLabel = operationLabelByJobId.get(job.id) ?? 'Operazione selezionata';
        const stock = job.stocks[0];
        if (!stock?.product || job.category !== JobCategory.TREATMENT) {
          reports.push(
            `${operationLabel}: saltata, sono supportate solo operazioni TREATMENT con stock prodotto.`,
          );
          continue;
        }
        const cycle = job.productionCycle || job.productionUnit.cycles[0];
        if (!cycle) {
          reports.push(`${operationLabel}: saltata, ciclo produttivo mancante.`);
          continue;
        }
        const labelExtraction = stock.product.registrationNumber
          ? await prisma.labelExtraction.findFirst({
              where: { registrationNumber: stock.product.registrationNumber, isArchived: false },
              orderBy: { updatedAt: 'desc' },
            })
          : null;
        const labelPayload = labelExtraction?.label as unknown;
        const label = isFitoLabel(labelPayload) ? (labelPayload as Label) : null;
        const constraints = await resolveConstraints({
          product: stock.product,
          cropName: cycle.cropName,
          avversity: job.avversity ?? null,
        });
        const isCoverageFungicide = getCoverageHint(job.category, label, optimizationRequest);
        let startDate = new Date(job.dateOfOpeation);
        let endDate = addDays(startDate, 28);
        const detail = await pickDoseDetail(label, cycle.cropName, job.avversity ?? null);
        if (detail?.epoca_impiego) {
          const bbchWindow = await mapEpocaToApplicationDates(detail, cycle.cropName, {
            startDate: job.productionUnit.startDate,
            floweringDate: cycle.floweringDate || undefined,
            harvestingDate: cycle.harvestingDate || undefined,
            endDate: job.productionUnit.endDate,
          });
          if (bbchWindow) {
            startDate = new Date(`${bbchWindow.startDate}T00:00:00.000Z`);
            endDate = new Date(`${bbchWindow.endDate}T00:00:00.000Z`);
          }
        }
        const epoca = (constraints.epocaImpiego || '').toLowerCase();
        const isFineFioritura =
          epoca.includes('fine della fioritura') || epoca.includes('post-fioritura');
        if (isCoverageFungicide && isFineFioritura && diffDays(startDate, endDate) < 12) {
          endDate = addDays(endDate, 21);
        }
        const desiredApplications = constraints.maxApplications
          ? Math.max(1, Math.min(constraints.maxApplications, 3))
          : 3;
        const distributedDates = buildDistributedDates(
          startDate,
          endDate,
          desiredApplications,
          Math.max(1, constraints.minIntervalDays),
        );
        const existingDateKey = toIsoDate(job.dateOfOpeation);
        const newDates = distributedDates.filter((date) => toIsoDate(date) !== existingDateKey);
        const quantity = clamp(job.quantity, constraints.doseMin, constraints.doseMax);
        if (createNewJobs) {
          for (const date of newDates) {
            const stocks: CreateStockProps[] = job.stocks.map((jobStock) => ({
              productId: jobStock.productId,
              quantity,
              unitOfMeasureQuantity: jobStock.unitOfMeasureQuantity,
              price: jobStock.price,
              unitOfMeasurePrice: jobStock.unitOfMeasurePrice,
              type: jobStock.type,
              companySupplierName: jobStock.companySupplierName,
            }));
            await createJobUseCase.execute({
              productionUnitId: job.productionUnitId,
              productionCycleId: job.productionCycleId,
              category: job.category,
              dateOfOpeation: new Date(toIsoDateTime(date)),
              quantity,
              unitOfMeasureQuantity: constraints.doseUnit || job.unitOfMeasureQuantity,
              avversity: job.avversity,
              modeOfApplication: job.modeOfApplication,
              giustification: 'AI optimization: distributed schedule from selected operation.',
              treatedSurface: job.treatedSurface,
              isLocalizedTreatment: job.isLocalizedTreatment,
              totalDistributedWaterL: job.totalDistributedWaterL,
              note: `Optimized from ${job.id}. Sources: ${constraints.source.join(', ') || 'job-context'}`,
              machineId: job.machineId,
              userId: options.userId,
              jobId: job.jobId,
              stocks,
            });
            createdJobs.push({
              operation: operationLabel,
              date: toIsoDate(date),
              quantity,
            });
          }
        }
        const warningsSuffix =
          constraints.warnings && constraints.warnings.length > 0
            ? ` WARNING: ${constraints.warnings.join('; ')}`
            : '';
        reports.push(
          `${operationLabel}: finestra ${toIsoDate(startDate)}..${toIsoDate(endDate)}, pianificate ${distributedDates.length} applicazioni, create ${createNewJobs ? newDates.length : 0}, vincoli=${constraints.source.join('+') || 'none'}.${warningsSuffix}`,
        );
      }
      return JSON.stringify(
        {
          selectedOperations: selectedJobIds.length,
          createNewJobs,
          optimizationRequest,
          summary: reports,
          createdJobs,
        },
        null,
        2,
      );
    },
  });
};
