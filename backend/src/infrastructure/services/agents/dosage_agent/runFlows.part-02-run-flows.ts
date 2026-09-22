import { InputDosageAgent, RunFlowsOptions } from './types';
import { flowMatchCropTreatment, UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { UnitAllowedProductsWithDosageOutput, calculateStockBalance, type StockBalanceReport } from './flowMatchProductionUnitTreatmentDosage';
import { hasContext } from './context';
import { performance } from 'perf_hooks';
import { flowOrchestrateProductSelection } from './flowOrchestrateProductSelection';
import { flowMatchProductionUnitTreatmentDosageV2 } from './flowMatchProductionUnitTreatmentDosage';
import { flowMatchDosageDisciplinari } from './flowMatchDosageDisciplinari';
import { flowCheckActiveIngredientCompatibility } from './activeIngredientCompatibilityChecker';
import { getActiveTreatments } from './productAccessors';
import { flowValidateRulesCompliance } from './flowValidateRulesCompliance';
import { flowValidateSAGroupLimits } from './saGroupLimitsValidator';
import { persistFlowJobs, prepareRunFlowsRuntime, yieldToEventLoop } from './runFlows.part-01-memory-divisor';

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
  const runtime = await prepareRunFlowsRuntime(input, options);
  const {
    historyManager,
    timings,
    totalStart,
    context,
    logger,
    resolvedInput,
    planningWindow,
    disciplinariContext,
    adjustedUnits,
    filteredInput,
    logPhaseTiming,
  } = runtime;

  const startMessage = `Avvio elaborazione: ${filteredInput.products.length} prodotti fitosanitari e ${adjustedUnits.length} unità produttive`;
  console.log(`[FLOWS] ${startMessage}`);

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: startMessage,
      metadata: {
        totalProducts: filteredInput.products.length,
        filteredFrom: resolvedInput.products?.length || 0,
        unitsCount: adjustedUnits.length,
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
      unitOfProduction: adjustedUnits,
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
    normalizedUnits: adjustedUnits,
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
  const validation = await flowValidateRulesCompliance(context, compatibilityCheckedOutcome);
  const {
    output: rulesValidatedOutcome,
    violations: ruleViolations,
  } = validation;
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
      normalizedUnits: adjustedUnits,
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

  const fillJobResult = await persistFlowJobs({
    input,
    options,
    units: saGroupValidatedOutcome,
    filteredInput,
    historyManager,
    validation,
    logPhaseTiming,
  });
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
