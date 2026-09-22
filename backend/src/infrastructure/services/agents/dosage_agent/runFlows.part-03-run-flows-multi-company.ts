import { InputDosageAgent, RunFlowsOptions, RawUnitOfProduction } from './types';
import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { UnitAllowedProductsWithDosageOutput, type StockBalanceReport } from './flowMatchProductionUnitTreatmentDosage';
import { expandUnitOfProductionWithCycles } from './productionCycleExpander';
import { groupUnitsByCompany } from './companyGrouper';
import { PrismaDosageAgentJobRepository } from '../../../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../../../repositories/Prisma';
import { generateJobName, updateMainJobProgress } from './jobProgressUpdater';
import { runFlows } from './runFlows.part-02-run-flows';

/**
 * Wrapper che divide il lavoro per azienda e crea job separati
 */
export const runFlowsMultiCompany = async (
  input: InputDosageAgent,
  options?: RunFlowsOptions,
): Promise<{
  jobs: Array<{
    jobId: string;
    companyId: string;
    companyName: string;
    outcome: ReadonlyArray<UnitAllowedProductsOutput>;
    outcomeWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
    stockBalance: StockBalanceReport;
  }>;
}> => {
  // Espandi le unità con i cicli
  const expandedUnits = await expandUnitOfProductionWithCycles(
    input.unitOfProduction as RawUnitOfProduction[],
  );

  // Raggruppa per azienda
  const companyMap = await groupUnitsByCompany(expandedUnits);
  const totalCompanies = companyMap.size;

  const results: Array<{
    jobId: string;
    companyId: string;
    companyName: string;
    outcome: ReadonlyArray<UnitAllowedProductsOutput>;
    outcomeWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
    stockBalance: StockBalanceReport;
  }> = [];

  const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);

  // Se c'è una sola azienda, usa direttamente il job principale senza creare sub-job
  const useSingleJob = totalCompanies === 1;

  // Inizializza il progresso del job principale a 0 (solo se più aziende)
  if (options?.queueJobId && options?.userId && !useSingleJob) {
    await updateMainJobProgress(options.queueJobId, options.userId, 0, totalCompanies);
  }

  let completedCount = 0;

  // Processa ogni azienda separatamente
  for (const [companyId, companyData] of companyMap) {
    // Se c'è una sola azienda, usa il jobId principale; altrimenti crea un sub-job
    const companyJobId = useSingleJob
      ? options?.queueJobId || `dosage-${companyId}-${Date.now()}`
      : options?.queueJobId
        ? `${options.queueJobId}-${companyId}`
        : `dosage-${companyId}-${Date.now()}`;

    // Filtra le unità per questa azienda
    const companyInput: InputDosageAgent = {
      ...input,
      unitOfProduction: companyData.units,
    };

    // Genera il nome del job
    const jobName = generateJobName(
      companyData.companyName,
      input.products.length,
      companyData.units.length,
    );

    // Aggiorna il nome del job (solo per sub-job o job singolo)
    if (options?.userId && (!useSingleJob || options?.queueJobId)) {
      try {
        await dosageAgentJobRepository.updateStatus({
          jobId: companyJobId,
          userId: options.userId,
          name: jobName,
        });
      } catch (error) {
        console.warn(`[FLOWS] Failed to create/update job ${companyJobId}:`, error);
      }
    }

    // Esegui il flusso per questa azienda
    const result = await runFlows(companyInput, {
      ...options,
      queueJobId: companyJobId,
      companyId: companyId === '__NO_COMPANY__' ? undefined : companyId,
      jobGroupId: useSingleJob ? undefined : options?.queueJobId, // jobGroupId solo per multi-azienda
    });

    results.push({
      jobId: companyJobId,
      companyId: companyId === '__NO_COMPANY__' ? '' : companyId,
      companyName: companyData.companyName,
      ...result,
    });

    completedCount += 1;

    // Aggiorna il progresso del job principale dopo ogni azienda completata (solo se più aziende)
    if (options?.queueJobId && options?.userId && !useSingleJob) {
      await updateMainJobProgress(
        options.queueJobId,
        options.userId,
        completedCount,
        totalCompanies,
      );
    }

    console.log(
      `[FLOWS] Company ${companyData.companyName} (${companyId}) completed: ${result.outcomeWithDosage.length} units processed (${completedCount}/${totalCompanies})`,
    );
  }

  return { jobs: results };
};
