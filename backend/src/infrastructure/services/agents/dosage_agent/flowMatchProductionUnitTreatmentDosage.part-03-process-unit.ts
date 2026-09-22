import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { PlanningWindow } from './planningWindow';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext } from './context';
import type { ExcludedProduct, OrchestratorConfig } from './types';
import { buildCompleteCycle } from './treatmentDatePlanner';
import { checkProductRevoked, buildRevokedExclusionMessage } from './revokedProductChecker';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { planTreatmentStrategy } from './treatmentStrategyPlanner';
import { mapWithLimit } from './parallelLimiter';
import { flowOptimizeDosageLinearFunc, type DosageStrategy } from './flowOptimizeDosageLineareFunc';
import { AllowedProductBase, LLM_CONCURRENCY_LIMIT, UnitAllowedProductsWithDosageOutput, buildUnitCycle } from './flowMatchProductionUnitTreatmentDosage.part-01-llm-concurrency-limit';
import { processProduct } from './flowMatchProductionUnitTreatmentDosage.part-02-process-product';

export async function processUnit(
  unit: UnitAllowedProductsOutput,
  planningWindow?: PlanningWindow,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
  orchestratorConfig?: OrchestratorConfig,
): Promise<UnitAllowedProductsWithDosageOutput> {
  const unitCycle = buildUnitCycle(unit);
  if (!unitCycle) {
    return {
      ...unit,
      products: unit.products?.map((p) => ({ ...p, trattamenti: undefined })) ?? [],
      excludedProducts: (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts ?? [],
    };
  }

  console.log(`[DOSAGE-V2] Unit ${unit.unitProductionId} - ${unitCycle.cropName}`);

  // Build complete cycle ONCE per unit (not per product!)
  const rawCycle = await buildCompleteCycle(unitCycle, context);
  if (!rawCycle) {
    console.error(`[DOSAGE-V2] Cannot build cycle for ${unitCycle.cropName}`);
    return {
      ...unit,
      products: unit.products?.map((p) => ({ ...p, trattamenti: undefined })) ?? [],
      excludedProducts: (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts ?? [],
    };
  }

  const completeCycle = planningWindow ? planningWindow.shiftCycleToWindow(rawCycle) : rawCycle;

  console.log(
    `[DOSAGE-V2] Cycle built: ${completeCycle.startDate.toISOString().split('T')[0]} - ${completeCycle.endDate.toISOString().split('T')[0]}`,
  );

  // CHECK REVOKED PRODUCTS: Filter out revoked products before processing
  const validProducts: AllowedProductBase[] = [];
  const revokedExcluded: ExcludedProduct[] = [];

  for (let i = 0; i < (unit.products || []).length; i++) {
    const product = unit.products![i];
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    const category = (product as { label?: { categoria?: string } }).label?.categoria || null;

    const revokeCheck = checkProductRevoked(regNumber, name);

    if (revokeCheck.isRevoked && revokeCheck.info) {
      console.warn(
        `[DOSAGE-V2] Product "${name}" (reg: ${regNumber}) is REVOKED. Excluding from treatment.`,
      );

      revokedExcluded.push({
        index: i + 1,
        name,
        regNumber,
        exclusionReason: buildRevokedExclusionMessage(revokeCheck.info),
        category,
        product: { ...product, quantity: 0 },
      });

      if (historyManager) {
        historyManager.addEntry(
          unit.unitProductionId,
          `${name}|${regNumber}`,
          'Prodotto revocato',
          buildRevokedExclusionMessage(revokeCheck.info),
          DosageAgentStep.CROP_MATCHING,
          DataSource.AUTOMATIC_CALCULATION,
          {
            productionUnitId: unit.unitProductionId,
            cropName: unitCycle.cropName,
            productName: name,
            productRegistrationNumber: regNumber,
            description: 'Prodotto escluso perché revocato dal Ministero della Salute.',
          },
        );
      }
    } else {
      validProducts.push(product);
    }
  }

  if (revokedExcluded.length > 0) {
    console.log(
      `[DOSAGE-V2] Excluded ${revokedExcluded.length} revoked products, processing ${validProducts.length} valid products`,
    );
  }

  // Build agronomic context from orchestrator config
  const agronomicContext = orchestratorConfig
    ? {
        agronomicNotes: orchestratorConfig.agronomicNotes ?? undefined,
        priorityTargets: orchestratorConfig.priorityTargets
          ? [...orchestratorConfig.priorityTargets]
          : undefined,
      }
    : undefined;

  // CROSS-PRODUCT STRATEGY: Plan coordinated treatment strategy before individual products
  const strategyPlan = await planTreatmentStrategy(
    validProducts,
    completeCycle,
    context,
    agronomicContext,
  );

  if (strategyPlan) {
    console.log(
      `[DOSAGE-V2] Strategy: ${strategyPlan.overallDescription} (${strategyPlan.strategies.length} product hints)`,
    );
  }

  // OPTIMIZATION: Process products with limited concurrency to avoid LLM rate limiting
  const products = await mapWithLimit(
    validProducts,
    (p) => {
      const regNumber = String((p as { regNumber?: string }).regNumber || '');
      const hint = strategyPlan?.strategies.find((s) => s.registrationNumber === regNumber);
      return processProduct(
        p,
        unit,
        completeCycle,
        planningWindow,
        historyManager,
        context,
        hint,
        agronomicContext,
      );
    },
    LLM_CONCURRENCY_LIMIT,
  );

  // Preserve excludedProducts from orchestrator and add revoked products
  const existingExcluded =
    (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts ?? [];
  const excludedProducts = [...existingExcluded, ...revokedExcluded];

  return {
    unitProductionId: unit.unitProductionId,
    cycleId: unit.cycleId,
    cropName: unit.cropName,
    variety: unit.variety,
    areaHa: (unit as { areaHa?: number }).areaHa,
    jobs: unit.jobs ?? [],
    products,
    excludedProducts,
  };
}

/**
 * Main flow V2 - Two LLM prompts per product:
 * 1. determineDateRange - when can we apply?
 * 2. planApplications - how many times and when exactly?
 * OPTIMIZATION: Uses parallel processing with concurrency limits
 */
export const flowMatchProductionUnitTreatmentDosageV2 = async (
  input: ReadonlyArray<UnitAllowedProductsOutput>,
  strategy?: DosageStrategy,
  historyManager?: JobHistoryManager,
  outStockLimiter: boolean = false,
  planningWindow?: PlanningWindow,
  context?: DosageAgentContext,
  orchestratorConfig?: OrchestratorConfig,
): Promise<ReadonlyArray<UnitAllowedProductsWithDosageOutput>> => {
  const start = Date.now();
  console.log(
    `[DOSAGE-V2] Starting for ${input.length} units with concurrency limit ${LLM_CONCURRENCY_LIMIT}`,
  );

  // OPTIMIZATION: Process units with limited concurrency
  // Note: Each unit processes its products in parallel (also limited),
  // so the effective concurrency is controlled at the product level
  const outputs = await mapWithLimit(
    input || [],
    (u) => processUnit(u, planningWindow, historyManager, context, orchestratorConfig),
    Math.min(5, input.length), // Limit units to 5 at a time, products are limited inside
  );

  console.log(`[DOSAGE-V2] Done in ${Date.now() - start}ms`);
  // Passa companyId dal context per recuperare lo stock aggregato dal DB
  const companyId = context?.companyId;
  return flowOptimizeDosageLinearFunc(
    outputs,
    strategy,
    historyManager,
    outStockLimiter,
    companyId,
  );
};
