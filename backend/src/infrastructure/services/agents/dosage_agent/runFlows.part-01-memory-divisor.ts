import { setImmediate as setImmediatePromise } from 'timers/promises';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { DisciplinariContext, InputDosageAgent, RunFlowsOptions, RawUnitOfProduction, FindLabelExtractionInputWithDosage } from './types';
import { PlanningWindow } from './planningWindow';
import { normalizedUnits } from '../../../utils/normalizeCrop';
import { performance } from 'perf_hooks';
import { LlmJobType } from '@prisma/client';
import { CompanyRulesService } from './companyRulesService';
import { expandUnitOfProductionWithCycles } from './productionCycleExpander';
import { applyFieldBufferZoneReduction } from './fieldBufferZoneExtractor';
import { classifyProduct } from './labelCategorizer';
import { ProductRegistrationLookupService } from '../../utils/ProductRegistrationLookup';
import { parseProductName } from '../../utils/ProductNameParser';
import { flowValidateRulesCompliance } from './flowValidateRulesCompliance';
import { fillTheJob } from './fillTheJob';

export const MEMORY_DIVISOR = 1024 * 1024;

export const PRODUCT_LOOP_YIELD_THRESHOLD = 10;

export const formatMemoryUsage = (): string => {
  const usage = process.memoryUsage();
  const rss = (usage.rss / MEMORY_DIVISOR).toFixed(2);
  const heapUsed = (usage.heapUsed / MEMORY_DIVISOR).toFixed(2);
  return `rss=${rss}MB heap=${heapUsed}MB`;
};

export const yieldToEventLoop = async (): Promise<void> => {
  await setImmediatePromise();
};

export interface RunFlowsRuntime {
  readonly historyManager: JobHistoryManager;
  readonly timings: Record<string, number>;
  readonly totalStart: number;
  readonly context?: DosageAgentContext;
  readonly logger: ReturnType<typeof DosageLoggerService.getInstance>;
  readonly resolvedInput: InputDosageAgent;
  readonly planningWindow?: PlanningWindow;
  readonly disciplinariContext?: DisciplinariContext;
  readonly adjustedUnits: ReturnType<typeof normalizedUnits>;
  readonly filteredInput: InputDosageAgent;
  readonly logPhaseTiming: (phase: string, startedAt: number) => void;
}

export async function prepareRunFlowsRuntime(
  input: InputDosageAgent,
  options?: RunFlowsOptions,
): Promise<RunFlowsRuntime> {
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
  const resolvedInput = await new CompanyRulesService().applyCompanyRules({
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
  const disciplinariContext = resolvedInput.orchestrator
    ? {
        agronomicNotes: resolvedInput.orchestrator.agronomicNotes,
        priorityTargets: resolvedInput.orchestrator.priorityTargets,
      }
    : undefined;
  const logPhaseTiming = (phase: string, startedAt: number): void => {
    const duration = performance.now() - startedAt;
    timings[phase] = duration;
    const memoryUsage = formatMemoryUsage();
    console.log(`[FLOWS][TIMING] ${phase} took ${duration.toFixed(2)}ms | ${memoryUsage}`);
    if (hasContext(context)) {
      logger.logTiming({
        jobId: context.jobId,
        userId: context.userId,
        phase,
        duration,
        memoryUsage,
      });
    }
  };
  const normalizationStart = performance.now();
  const expandedUnits = await expandUnitOfProductionWithCycles(
    resolvedInput.unitOfProduction as RawUnitOfProduction[],
  );
  const normalized = normalizedUnits({ unitOfProduction: expandedUnits });
  logPhaseTiming('normalize-units', normalizationStart);
  await yieldToEventLoop();
  const bufferZoneStart = performance.now();
  const adjustedUnits = await applyFieldBufferZoneReduction(normalized, context);
  logPhaseTiming('buffer-zone-reduction', bufferZoneStart);
  await yieldToEventLoop();
  const filterStart = performance.now();
  const validProducts: FindLabelExtractionInputWithDosage[] = [];
  for (const [index, product] of (resolvedInput.products || []).entries()) {
    const classification = classifyProduct(product.registrationNumber, product.productName);
    if (classification === null) {
      console.log(`[FLOWS] Product "${product.productName}" (${product.registrationNumber}) classified as fertilizer. Skipping.`);
    } else {
      validProducts.push(product);
    }
    if (index > 0 && index % PRODUCT_LOOP_YIELD_THRESHOLD === 0) await yieldToEventLoop();
  }
  logPhaseTiming('filter-products', filterStart);
  const registrationLookup = new ProductRegistrationLookupService();
  const correctedProducts = validProducts.map((product) => {
    const cleanName = parseProductName(product.productName).baseName || product.productName;
    const match = registrationLookup.findProduct(cleanName);
    if (!match) return product;
    const registrationChanged =
      product.registrationNumber.replace(/^0+/, '') !== match.registrationNumber.replace(/^0+/, '');
    const officialName = registrationLookup.getProductDenomination(match.registrationNumber);
    const nameChanged = officialName?.toLowerCase() !== product.productName.toLowerCase();
    if (!registrationChanged && !nameChanged) return product;
    const corrected = {
      ...product,
      registrationNumber: registrationChanged ? match.registrationNumber : product.registrationNumber,
      productName: nameChanged && officialName ? officialName : product.productName,
    };
    console.log(`[FLOWS] Product corrected: "${product.productName}" (${product.registrationNumber}) → "${corrected.productName}" (${corrected.registrationNumber})`);
    return corrected;
  });
  return {
    historyManager,
    timings,
    totalStart,
    context,
    logger,
    resolvedInput,
    planningWindow,
    disciplinariContext,
    adjustedUnits,
    filteredInput: { ...resolvedInput, products: correctedProducts },
    logPhaseTiming,
  };
}

export type RulesValidationResult = Awaited<ReturnType<typeof flowValidateRulesCompliance>>;

export async function persistFlowJobs(params: {
  readonly input: InputDosageAgent;
  readonly options?: RunFlowsOptions;
  readonly units: RulesValidationResult['output'];
  readonly filteredInput: InputDosageAgent;
  readonly historyManager: JobHistoryManager;
  readonly validation: RulesValidationResult;
  readonly logPhaseTiming: (phase: string, startedAt: number) => void;
}): Promise<Awaited<ReturnType<typeof fillTheJob>>> {
  const { input, options, units, filteredInput, historyManager, validation, logPhaseTiming } = params;
  if (options?.persist === false) {
    console.log('[FLOWS] Skipping fillTheJob (persistence disabled)');
    return { warnings: [], jobsByUnit: new Map() };
  }
  const fillJobStart = performance.now();
  const machineId = options?.companyId
    ? input.operationMachines?.find((machine) => machine.companyId === options.companyId)?.machineId
    : input.operationMachines?.[0]?.machineId;
  const operatorId = options?.companyId
    ? input.operationOperators?.find((operator) => operator.companyId === options.companyId)?.userId
    : input.operationOperators?.[0]?.userId;
  const result = await fillTheJob({
    units,
    requestedProducts: filteredInput.products,
    queueJobId: options?.queueJobId,
    historyManager,
    ruleViolations: validation.violations,
    disciplinareInfoMap: validation.disciplinareInfoMap,
    appliedRulesByProduct: validation.appliedRulesByProduct,
    machineId,
    operatorId,
  });
  logPhaseTiming('fill-job', fillJobStart);
  result.warnings.forEach((warning) => console.warn(`[FLOWS] fillTheJob warning: ${warning}`));
  return result;
}
