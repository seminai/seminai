import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import type { OrchestratorConfig, ExcludedProduct } from './types';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { UnitAllowedProductsWithExcludedOutput, selectProductsWithLlm } from './flowOrchestrateProductSelection.part-02-select-products-with-llm';
import { OrchestrationSummary, buildProductFeatures, pickFallbackProducts } from './flowOrchestrateProductSelection.part-01-usage-logger';

/**
 * Main orchestration flow: filters and prioritizes products across all units.
 * Returns both selected and excluded products with specific exclusion reasons.
 */
export async function flowOrchestrateProductSelection(
  input: ReadonlyArray<UnitAllowedProductsOutput>,
  config: OrchestratorConfig | undefined,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
): Promise<{
  output: ReadonlyArray<UnitAllowedProductsWithExcludedOutput>;
  summary: OrchestrationSummary;
}> {
  const effectiveConfig: OrchestratorConfig = {
    objective: 'balanced',
    allowOutsideProductionTreatments: true,
    useLlmForSelection: true,
    maxApplicationsPerProductPerUnit: null,
    ...config,
  };

  const logger = DosageLoggerService.getInstance();
  const startTime = Date.now();

  console.log(
    `[ORCHESTRATOR] Starting product selection for ${input.length} units. ` +
      `Intensity: ${effectiveConfig.intensity}, Objective: ${effectiveConfig.objective}`,
  );

  if (hasContext(context)) {
    logger.logInfo({
      jobId: context.jobId,
      userId: context.userId,
      message: `Orchestrator starting with config: ${JSON.stringify(effectiveConfig)}`,
      metadata: { unitsCount: input.length },
    });
  }

  let totalOriginalProducts = 0;
  let totalSelectedProducts = 0;
  let totalRemovedProducts = 0;
  let estimatedJobs = 0;

  const orchestratedUnits: UnitAllowedProductsWithExcludedOutput[] = [];

  for (const unit of input) {
    totalOriginalProducts += (unit.products || []).length;

    const selectionResult =
      effectiveConfig.useLlmForSelection === false
        ? { ...pickFallbackProducts(unit, effectiveConfig), reason: null }
        : await selectProductsWithLlm(unit, effectiveConfig, context);

    const {
      selected: selectedProductObjects,
      excluded: excludedProducts,
      reason,
    } = selectionResult;

    const removedCount = (unit.products || []).length - selectedProductObjects.length;
    totalRemovedProducts += Math.max(0, removedCount);
    totalSelectedProducts += selectedProductObjects.length;

    const selectedFeatures = selectedProductObjects.map((p) =>
      buildProductFeatures(p, effectiveConfig),
    );
    estimatedJobs += selectedFeatures.reduce((sum, f) => sum + f.estimatedApplications, 0);

    if (historyManager) {
      const selectedNames = selectedProductObjects
        .map((p) => String((p as { name?: string }).name || ''))
        .join(', ');

      // Determine if priorityTargets were specified
      const hasPriorityTargets =
        Array.isArray(effectiveConfig.priorityTargets) &&
        effectiveConfig.priorityTargets.length > 0;

      // Different history entry based on whether filtering was applied
      if (hasPriorityTargets) {
        historyManager.addEntry(
          unit.unitProductionId,
          'ORCHESTRATOR',
          `Filtro prodotti per target: ${selectedProductObjects.length}/${(unit.products || []).length}`,
          `Target prioritari: ${effectiveConfig.priorityTargets.join(', ')}. Selezionati: ${selectedNames}. Motivo: ${reason ?? 'N/A'}`,
          DosageAgentStep.CROP_MATCHING,
          DataSource.LLM_OPENAI,
          {
            productionUnitId: unit.unitProductionId,
            cropName: String(unit.cropName || ''),
            description: `Filtro prodotti in base ai target prioritari specificati. I controlli di conformità (disciplinari, principi attivi) verranno applicati successivamente.`,
          },
        );
      } else {
        historyManager.addEntry(
          unit.unitProductionId,
          'ORCHESTRATOR',
          `Nessun filtro: inclusi tutti i ${selectedProductObjects.length} prodotti`,
          `Selezionati: ${selectedNames}. ${reason ?? 'Nessun target prioritario specificato.'}`,
          DosageAgentStep.CROP_MATCHING,
          DataSource.AUTOMATIC_CALCULATION,
          {
            productionUnitId: unit.unitProductionId,
            cropName: String(unit.cropName || ''),
            description: `Nessun target prioritario specificato: inclusi tutti i prodotti compatibili con la coltura. I controlli di conformità (disciplinari, principi attivi) verranno applicati successivamente.`,
          },
        );
      }

      // Track excluded products in history (only when there are excluded products)
      for (const excluded of excludedProducts) {
        historyManager.addEntry(
          unit.unitProductionId,
          `${excluded.name}|${excluded.regNumber}`,
          `Prodotto escluso dalla selezione`,
          excluded.exclusionReason,
          DosageAgentStep.CROP_MATCHING,
          hasPriorityTargets ? DataSource.LLM_OPENAI : DataSource.AUTOMATIC_CALCULATION,
          {
            productionUnitId: unit.unitProductionId,
            cropName: String(unit.cropName || ''),
            productName: excluded.name,
            productRegistrationNumber: excluded.regNumber,
            description: `Prodotto non selezionato per il trattamento. Verrà creato job con quantity 0.`,
          },
        );
      }
    }

    // Combine excluded products from matching phase with those from selection phase
    const matchingExcluded =
      (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts || [];
    const allExcludedProducts = [...matchingExcluded, ...excludedProducts];

    orchestratedUnits.push({
      ...unit,
      products: selectedProductObjects,
      excludedProducts: allExcludedProducts,
    });
  }

  const reductionPercentage =
    totalOriginalProducts > 0
      ? ((totalOriginalProducts - totalSelectedProducts) / totalOriginalProducts) * 100
      : 0;

  const summary: OrchestrationSummary = {
    totalUnits: input.length,
    totalOriginalProducts,
    totalSelectedProducts,
    totalRemovedProducts,
    estimatedJobs,
    reductionPercentage,
  };

  const durationMs = Date.now() - startTime;
  console.log(
    `[ORCHESTRATOR] Completed in ${durationMs}ms. ` +
      `Products: ${totalOriginalProducts} -> ${totalSelectedProducts} (-${reductionPercentage.toFixed(1)}%). ` +
      `Excluded with reasons: ${totalRemovedProducts}. Estimated jobs: ${estimatedJobs}`,
  );

  if (hasContext(context)) {
    logger.logInfo({
      jobId: context.jobId,
      userId: context.userId,
      message: `Orchestrator completed: ${totalSelectedProducts}/${totalOriginalProducts} products selected, ${totalRemovedProducts} excluded with reasons`,
      metadata: {
        ...summary,
        durationMs,
      },
    });
  }

  // Check maxTotalJobs limit
  if (effectiveConfig.maxTotalJobs && estimatedJobs > effectiveConfig.maxTotalJobs) {
    console.warn(
      `[ORCHESTRATOR] Estimated jobs (${estimatedJobs}) exceeds maxTotalJobs (${effectiveConfig.maxTotalJobs}). ` +
        `Consider reducing intensity or maxProductsPerUnit.`,
    );
  }

  return { output: orchestratedUnits, summary };
}
