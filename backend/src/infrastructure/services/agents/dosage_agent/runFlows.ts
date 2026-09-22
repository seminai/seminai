import { LlmJobType } from '@prisma/client';
import { performance } from 'perf_hooks';
import { setImmediate as setImmediatePromise } from 'timers/promises';
import { flowMatchCropTreatment, UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { normalizedUnits } from '../../../utils/normalizeCrop';
import { classifyProduct } from './labelCategorizer';
import {
  UnitAllowedProductsWithDosageOutput,
  calculateStockBalance,
  type StockBalanceReport,
} from './flowMatchProductionUnitTreatmentDosage';
import { flowMatchProductionUnitTreatmentDosageV2 } from './flowMatchProductionUnitTreatmentDosage';
import { flowMatchDosageDisciplinari } from './flowMatchDosageDisciplinari';
import { flowCheckActiveIngredientCompatibility } from './activeIngredientCompatibilityChecker';
import { flowValidateSAGroupLimits } from './saGroupLimitsValidator';
import { flowValidateRulesCompliance } from './flowValidateRulesCompliance';
import { fillTheJob } from './fillTheJob';
import { JobHistoryManager } from './historyCollector';
import { DosageLoggerService } from '../../dosage-logger.service';
import { DosageAgentContext, hasContext } from './context';
import { PlanningWindow } from './planningWindow';
import { prisma } from '../../../repositories/Prisma';
import { flowOrchestrateProductSelection } from './flowOrchestrateProductSelection';
import { PrismaDosageAgentJobRepository } from '../../../repositories/PrismaDosageAgentJobRepository';
import {
  DisciplinariContext,
  InputDosageAgent,
  RunFlowsOptions,
  RawUnitOfProduction,
  FindLabelExtractionInputWithDosage,
} from './types';
import { expandUnitOfProductionWithCycles } from './productionCycleExpander';
import { groupUnitsByCompany } from './companyGrouper';
import { applyFieldBufferZoneReduction } from './fieldBufferZoneExtractor';
import { generateJobName, updateMainJobProgress } from './jobProgressUpdater';
import { CompanyRulesService } from './companyRulesService';
import { getActiveTreatments } from './productAccessors';
import { ProductRegistrationLookupService } from '../../utils/ProductRegistrationLookup';
import { parseProductName } from '../../utils/ProductNameParser';

const MEMORY_DIVISOR = 1024 * 1024;
const PRODUCT_LOOP_YIELD_THRESHOLD = 10;

const formatMemoryUsage = (): string => {
  const usage = process.memoryUsage();
  const rss = (usage.rss / MEMORY_DIVISOR).toFixed(2);
  const heapUsed = (usage.heapUsed / MEMORY_DIVISOR).toFixed(2);
  return `rss=${rss}MB heap=${heapUsed}MB`;
};

const yieldToEventLoop = async (): Promise<void> => {
  await setImmediatePromise();
};
/**
 * Esegue il flusso di calcolo del dosage agent base
 * @param input - Input del dosage agent
 * @param options - Opzioni del dosage agent
 * @returns Output del dosage agent
 */
export const runFlows = async (
  input: InputDosageAgent,
  options?: RunFlowsOptions,
): Promise<{
  outcome: ReadonlyArray<UnitAllowedProductsOutput>;
  outcomeWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  stockBalance: StockBalanceReport;
}> => {
  const historyManager = new JobHistoryManager();
  const timings: Record<string, number> = {};
  const totalStart = performance.now();

  const context: DosageAgentContext | undefined =
    options?.queueJobId && options?.userId
      ? {
          jobId: options.queueJobId,
          userId: options.userId,
          jobGroupId: options.jobGroupId ?? options.queueJobId,
          companyId: options.companyId,
          jobType: options.jobType ?? LlmJobType.DOSAGE,
        }
      : undefined;

  const logger = DosageLoggerService.getInstance();
  const rulesService = new CompanyRulesService();
  const resolvedInput = await rulesService.applyCompanyRules({
    companyId: options?.companyId,
    input,
  });
  const startAt =
    typeof resolvedInput.startAt === 'string'
      ? new Date(resolvedInput.startAt)
      : resolvedInput.startAt;
  const endAt =
    typeof resolvedInput.endAt === 'string' ? new Date(resolvedInput.endAt) : resolvedInput.endAt;
  const planningWindow = startAt || endAt ? new PlanningWindow({ startAt, endAt }) : undefined;
  const disciplinariContext: DisciplinariContext | undefined = resolvedInput.orchestrator
    ? {
        agronomicNotes: resolvedInput.orchestrator.agronomicNotes,
        priorityTargets: resolvedInput.orchestrator.priorityTargets,
      }
    : undefined;

  const logPhaseTiming = (phase: string, startedAt: number): void => {
    const duration = performance.now() - startedAt;
    timings[phase] = duration;
    const memUsage = formatMemoryUsage();
    console.log(`[FLOWS][TIMING] ${phase} took ${duration.toFixed(2)}ms | ${memUsage}`);

    if (hasContext(context)) {
      logger.logTiming({
        jobId: context.jobId,
        userId: context.userId,
        phase,
        duration,
        memoryUsage: memUsage,
      });
    }
  };

  const normalizationStart = performance.now();
  const expandedUnitOfProduction = await expandUnitOfProductionWithCycles(
    resolvedInput.unitOfProduction as RawUnitOfProduction[],
  );
  const NORMALIZED_UNIT_OF_PRODUCTION = normalizedUnits({
    unitOfProduction: expandedUnitOfProduction,
  });
  logPhaseTiming('normalize-units', normalizationStart);
  await yieldToEventLoop();

  // Buffer zone area reduction: extract field buffer zones and reduce treatable area
  const bufferZoneStart = performance.now();
  const BUFFER_ZONE_ADJUSTED_UNITS = await applyFieldBufferZoneReduction(
    NORMALIZED_UNIT_OF_PRODUCTION,
    context,
  );
  logPhaseTiming('buffer-zone-reduction', bufferZoneStart);
  await yieldToEventLoop();

  // Filter products based on classification
  const filterStart = performance.now();
  const allProducts = resolvedInput.products || [];
  const validProducts: FindLabelExtractionInputWithDosage[] = [];
  for (let index = 0; index < allProducts.length; index += 1) {
    const product = allProducts[index];
    const classification = classifyProduct(product.registrationNumber, product.productName);
    if (classification === null) {
      console.log(
        `[FLOWS] Product "${product.productName}" (${product.registrationNumber}) classified as fertilizer. Skipping.`,
      );
    } else {
      validProducts.push(product);
    }
    if (index > 0 && index % PRODUCT_LOOP_YIELD_THRESHOLD === 0) {
      await yieldToEventLoop();
    }
  }
  logPhaseTiming('filter-products', filterStart);

  // Clean product names (remove packaging info) and correct registration numbers + names
  const regLookup = new ProductRegistrationLookupService();
  const correctedProducts = validProducts.map((product) => {
    const parsed = parseProductName(product.productName);
    const cleanName = parsed.baseName || product.productName;
    const lookup = regLookup.findProduct(cleanName);
    if (!lookup) return product;
    const inputReg = product.registrationNumber.replace(/^0+/, '');
    const datasetReg = lookup.registrationNumber.replace(/^0+/, '');
    const officialName = regLookup.getProductDenomination(lookup.registrationNumber);
    const regChanged = inputReg !== datasetReg;
    const nameChanged =
      officialName && officialName.toLowerCase() !== product.productName.toLowerCase();
    if (!regChanged && !nameChanged) return product;
    const corrected = { ...product };
    if (regChanged) {
      corrected.registrationNumber = lookup.registrationNumber;
    }
    if (nameChanged && officialName) {
      corrected.productName = officialName;
    }
    console.log(
      `[FLOWS] Product corrected: "${product.productName}" (${product.registrationNumber}) → "${corrected.productName}" (${corrected.registrationNumber})`,
    );
    return corrected;
  });

  const filteredInput: InputDosageAgent = {
    ...resolvedInput,
    products: correctedProducts,
  };

  const startMessage = `Avvio elaborazione: ${filteredInput.products.length} prodotti fitosanitari e ${BUFFER_ZONE_ADJUSTED_UNITS.length} unità produttive`;
  console.log(`[FLOWS] ${startMessage}`);

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: startMessage,
      metadata: {
        totalProducts: filteredInput.products.length,
        filteredFrom: resolvedInput.products?.length || 0,
        unitsCount: BUFFER_ZONE_ADJUSTED_UNITS.length,
      },
    });
  }

  if (filteredInput.products.length === 0) {
    console.warn(
      '[FLOWS] No valid phytosanitary products remaining after filtering. Skipping flows.',
    );
    logPhaseTiming('total', totalStart);
    return {
      outcome: [],
      outcomeWithDosage: [],
      stockBalance: {
        timestamp: new Date(),
        totalProducts: 0,
        productsOverused: 0,
        productsWithinLimit: 0,
        products: [],
      },
    };
  }

  const matchingStart = performance.now();
  const matchedOutcome = await flowMatchCropTreatment(
    {
      ...filteredInput,
      unitOfProduction: BUFFER_ZONE_ADJUSTED_UNITS,
    },
    historyManager,
    context,
  );
  logPhaseTiming('match-crop-treatment', matchingStart);

  const matchedMessage = `Matching completato: ${matchedOutcome.reduce((s, u) => s + (u.products?.length || 0), 0)} prodotti compatibili su ${matchedOutcome.length} unità`;
  console.log(`[FLOWS] ${matchedMessage}`);

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: matchedMessage,
      metadata: {
        matchedUnits: matchedOutcome.length,
        totalProducts: matchedOutcome.reduce((s, u) => s + (u.products?.length || 0), 0),
      },
    });
  }
  await yieldToEventLoop();

  // ORCHESTRATOR: Filter and prioritize products to avoid job explosion
  const orchestratorStart = performance.now();
  const { output: outcome, summary: orchestrationSummary } = await flowOrchestrateProductSelection(
    matchedOutcome,
    resolvedInput.orchestrator,
    historyManager,
    context,
  );
  logPhaseTiming('orchestrator-selection', orchestratorStart);

  const orchestratorMessage = `Selezione prodotti: ${orchestrationSummary.totalSelectedProducts}/${orchestrationSummary.totalOriginalProducts} selezionati, ${orchestrationSummary.estimatedJobs} interventi stimati`;
  console.log(`[FLOWS] ${orchestratorMessage}`);

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: orchestratorMessage,
      metadata: {
        ...orchestrationSummary,
        orchestratorConfig: resolvedInput.orchestrator,
      },
    });
  }
  await yieldToEventLoop();

  // V2: due prompt LLM semplici per date range e pianificazione applicazioni
  const dosageStart = performance.now();
  const outcomeWithDosage = await flowMatchProductionUnitTreatmentDosageV2(
    outcome,
    resolvedInput.strategy,
    historyManager,
    resolvedInput.outStockLimiter ?? false,
    planningWindow,
    context,
    resolvedInput.orchestrator,
  );
  logPhaseTiming('dosage-calculation', dosageStart);
  console.log(`[FLOWS] Dosage calculation completed for ${outcomeWithDosage.length} units`);
  await yieldToEventLoop();

  const disciplinariStart = performance.now();
  const disciplinariAdjustedOutcome = await flowMatchDosageDisciplinari({
    units: outcomeWithDosage,
    normalizedUnits: BUFFER_ZONE_ADJUSTED_UNITS,
    historyManager,
    disciplinariContext,
  });
  logPhaseTiming('disciplinari-adjustment', disciplinariStart);
  await yieldToEventLoop();

  // Active Ingredient Compatibility Check: verifica compatibilità principi attivi PRIMA dei limiti SA
  // (deve avvenire prima perché le esclusioni per incompatibilità modificano i conteggi dei trattamenti)
  const compatibilityStart = performance.now();
  const compatibilityCheckedOutcome = await flowCheckActiveIngredientCompatibility(
    disciplinariAdjustedOutcome,
    historyManager,
    context,
  );
  logPhaseTiming('active-ingredient-compatibility', compatibilityStart);

  const compatibilityMessage = `Active ingredient compatibility check completed for ${compatibilityCheckedOutcome.length} units`;
  console.log(`[FLOWS] ${compatibilityMessage}`);

  if (hasContext(context)) {
    const totalExcluded = compatibilityCheckedOutcome.reduce((sum, unit) => {
      const excludedCount = (unit.products || []).filter(
        (p) => getActiveTreatments(p).length === 0,
      ).length;
      return sum + excludedCount;
    }, 0);

    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: compatibilityMessage,
      metadata: {
        unitsProcessed: compatibilityCheckedOutcome.length,
        productsExcluded: totalExcluded,
      },
    });
  }
  await yieldToEventLoop();

  // Rules Compliance Validation: validates products against vectorized rule PDFs (DISCIPLINARE, STANDARD, METHODOLOGY)
  // Runs BEFORE SA Group Limits so that individual product violations are resolved first,
  // and group-level treatment counts reflect the final set of active treatments.
  const rulesComplianceStart = performance.now();
  const {
    output: rulesValidatedOutcome,
    violations: ruleViolations,
    disciplinareInfoMap,
    appliedRulesByProduct,
  } = await flowValidateRulesCompliance(context, compatibilityCheckedOutcome);
  logPhaseTiming('rules-compliance-validation', rulesComplianceStart);

  const rulesComplianceMessage = `Controllo normativo: ${ruleViolations.length} violazioni trovate`;
  console.log(`[FLOWS] ${rulesComplianceMessage}`);

  if (hasContext(context)) {
    const criticalCount = ruleViolations.filter((v) => v.severity === 'CRITICAL').length;
    const warningCount = ruleViolations.filter((v) => v.severity === 'WARNING').length;
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: rulesComplianceMessage,
      metadata: {
        totalViolations: ruleViolations.length,
        criticalViolations: criticalCount,
        warningViolations: warningCount,
      },
    });
  }
  await yieldToEventLoop();

  // SA Group Limits Validation: verifica limiti numero trattamenti per gruppo sostanza attiva
  // Runs LAST among validation steps: after compatibility check and rules compliance have
  // zeroed individual treatments, so group-level counts are accurate.
  const saGroupStart = performance.now();
  const saGroupValidatedOutcome = (
    await flowValidateSAGroupLimits({
      units: rulesValidatedOutcome,
      normalizedUnits: BUFFER_ZONE_ADJUSTED_UNITS,
      historyManager,
      context,
    })
  ).units;
  logPhaseTiming('sa-group-limits-validation', saGroupStart);
  console.log(
    `[FLOWS] SA Group limits validation completed for ${saGroupValidatedOutcome.length} units`,
  );
  await yieldToEventLoop();

  const stockBalance = calculateStockBalance(saGroupValidatedOutcome);
  const stockMessage = `Bilancio magazzino: ${stockBalance.productsOverused} prodotti in eccesso, ${stockBalance.productsWithinLimit} nei limiti`;
  console.log(`[FLOWS] ${stockMessage}`);

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: stockMessage,
      metadata: {
        productsOverused: stockBalance.productsOverused,
        productsWithinLimit: stockBalance.productsWithinLimit,
        totalProducts: stockBalance.totalProducts,
      },
    });
  }

  const shouldPersist = options?.persist !== false;
  let fillJobResult: Awaited<ReturnType<typeof fillTheJob>> = {
    warnings: [],
    jobsByUnit: new Map(),
  };

  if (shouldPersist) {
    const fillJobStart = performance.now();
    // Risolvi machineId e operatorId per la company corrente
    const companyMachineId = options?.companyId
      ? input.operationMachines?.find((m) => m.companyId === options.companyId)?.machineId
      : input.operationMachines?.[0]?.machineId;
    const companyOperatorId = options?.companyId
      ? input.operationOperators?.find((o) => o.companyId === options.companyId)?.userId
      : input.operationOperators?.[0]?.userId;

    fillJobResult = await fillTheJob({
      units: saGroupValidatedOutcome,
      requestedProducts: filteredInput.products,
      queueJobId: options?.queueJobId,
      historyManager,
      ruleViolations,
      disciplinareInfoMap,
      appliedRulesByProduct,
      machineId: companyMachineId,
      operatorId: companyOperatorId,
    });
    logPhaseTiming('fill-job', fillJobStart);
    if (fillJobResult.warnings.length > 0) {
      fillJobResult.warnings.forEach((warning) => {
        console.warn(`[FLOWS] fillTheJob warning: ${warning}`);
      });
    }
  } else {
    console.log('[FLOWS] Skipping fillTheJob (persistence disabled)');
  }
  await yieldToEventLoop();

  const enrichedOutcome: ReadonlyArray<UnitAllowedProductsOutput> = outcome.map((unit) => ({
    ...unit,
    jobs: fillJobResult.jobsByUnit.get(unit.unitProductionId) ?? [],
  }));

  const enrichedOutcomeWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput> =
    saGroupValidatedOutcome.map((unit) => ({
      ...unit,
      jobs: fillJobResult.jobsByUnit.get(unit.unitProductionId) ?? [],
    }));
  logPhaseTiming('total', totalStart);
  console.log('[FLOWS][TIMING] Summary', timings);

  return {
    outcome: enrichedOutcome,
    outcomeWithDosage: enrichedOutcomeWithDosage,
    stockBalance: stockBalance,
  };
};

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
