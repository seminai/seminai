import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import type { OrchestratorConfig, ExcludedProduct } from './types';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../repositories/Prisma';
import { LlmCacheService } from './llmCacheService';
import { callWithFallback, extractResponseText } from './llmProvider';

const usageLogger = LlmUsageLogger.getInstance();
const llmCacheService = new LlmCacheService(prisma, 5);
const ORCHESTRATOR_SELECTION_PROMPT_VERSION = 'orchestrator-selection-v3';

/**
 * Schema per la motivazione di esclusione di un singolo prodotto
 */
const ExcludedProductReasonSchema = z.object({
  index: z.number().int().min(1).describe('1-based index of excluded product'),
  reason: z
    .string()
    .describe(
      'Specific reason why this product was excluded (e.g., redundant coverage, no stock, lower priority)',
    ),
});

/**
 * Schema LLM per la selezione prodotti con motivazioni di esclusione
 */
const LlmProductSelectionSchema = z.object({
  selectedIndices: z.array(z.number().int().min(1)).describe('1-based indices of products to keep'),
  reason: z
    .string()
    .optional()
    .nullable()
    .describe('Short general explanation of selection strategy'),
  excludedProducts: z
    .array(ExcludedProductReasonSchema)
    .describe(
      'REQUIRED: For EVERY product NOT in selectedIndices, provide the index and a specific reason for exclusion',
    ),
});

type LlmProductSelection = z.infer<typeof LlmProductSelectionSchema>;

/**
 * Default limits based on intensity level
 */
const INTENSITY_DEFAULTS: Record<'low' | 'medium' | 'high', { maxProductsPerUnit: number }> = {
  low: { maxProductsPerUnit: 3 },
  medium: { maxProductsPerUnit: 6 },
  high: { maxProductsPerUnit: 10 },
};

/**
 * Default category priority (higher index = higher priority)
 */
const DEFAULT_CATEGORY_PRIORITY: string[] = [
  'acaricide',
  'molluscicide',
  'nematicide',
  'herbicide',
  'insecticide',
  'fungicide',
];

interface ProductFeatures {
  readonly product: UnitAllowedProductsOutput['products'][number];
  readonly name: string;
  readonly category: string | null;
  readonly targets: string[];
  readonly frac: string | null;
  readonly hasStock: boolean;
  readonly estimatedApplications: number;
}

/**
 * Summary statistics from orchestration
 */
export interface OrchestrationSummary {
  readonly totalUnits: number;
  readonly totalOriginalProducts: number;
  readonly totalSelectedProducts: number;
  readonly totalRemovedProducts: number;
  readonly estimatedJobs: number;
  readonly reductionPercentage: number;
}

/**
 * Extracts label from product
 */
function extractLabel(product: UnitAllowedProductsOutput['products'][number]): Label | null {
  const label = (product as { label?: unknown }).label;
  return label && isFitoLabel(label) ? label : null;
}

/**
 * Extracts category from label (normalized)
 */
function extractCategory(label: Label | null): string | null {
  if (!label?.categoria) return null;
  const cat = label.categoria.toLowerCase();
  if (cat.includes('fungicid')) return 'fungicide';
  if (cat.includes('insetticid') || cat.includes('insecticid')) return 'insecticide';
  if (cat.includes('erbicid') || cat.includes('herbicid') || cat.includes('diserbant'))
    return 'herbicide';
  if (cat.includes('acaricid')) return 'acaricide';
  if (cat.includes('mollusc')) return 'molluscicide';
  if (cat.includes('nematocid') || cat.includes('nematicid')) return 'nematicide';
  return 'other';
}

/**
 * Extracts FRAC/IRAC/HRAC code from label for resistance management
 */
function extractMoaCode(label: Label | null): string | null {
  if (!label) return null;
  const moa = label.meccanismo_azione_frac?.trim();
  if (moa) return moa;
  // Note: label.resistenze is a structured object (LabelResistance[]), not a FRAC/IRAC code.
  // We intentionally do not infer FRAC/IRAC from that field to avoid incorrect grouping.
  return null;
}

/**
 * Extracts target diseases/pests from label
 */
function extractTargets(label: Label | null): string[] {
  if (!label) return [];
  const targets: string[] = [];
  if (label.malattie) targets.push(...label.malattie);
  if (label.specie) targets.push(...label.specie);
  // Also check dosaggi_dettagliati for malattia field
  if (label.dosaggi_dettagliati) {
    for (const d of label.dosaggi_dettagliati) {
      if (d.malattia) targets.push(d.malattia);
    }
  }
  return [...new Set(targets.map((t) => t.toLowerCase().trim()))];
}

/**
 * Estimates number of applications based on label constraints
 */
function estimateApplications(
  label: Label | null,
  maxApplicationsPerProduct: number | null,
): number {
  if (!label?.dosaggi_dettagliati || label.dosaggi_dettagliati.length === 0) {
    return 1;
  }
  // Find the max applications allowed by label
  const labelMaxApps = Math.max(...label.dosaggi_dettagliati.map((d) => d.n_max_applicazioni ?? 1));
  // If config does not define an extra cap, rely only on label
  if (maxApplicationsPerProduct === null) {
    return labelMaxApps;
  }
  // Otherwise, return the minimum between label limit and config limit
  return Math.min(labelMaxApps, maxApplicationsPerProduct);
}

function buildProductFeatures(
  product: UnitAllowedProductsOutput['products'][number],
  config: OrchestratorConfig,
): ProductFeatures {
  const label = extractLabel(product);
  const category = extractCategory(label);
  const moa = extractMoaCode(label);
  const targets = extractTargets(label);
  const quantity = (product as { quantity?: number }).quantity ?? 0;
  const hasStock = quantity > 0;
  const maxAppsConfig =
    typeof config.maxApplicationsPerProductPerUnit === 'number'
      ? config.maxApplicationsPerProductPerUnit
      : null;
  const estimatedApplications = estimateApplications(label, maxAppsConfig);
  const name = String((product as { name?: string }).name || '');
  return {
    product,
    name,
    category,
    targets,
    frac: moa,
    hasStock,
    estimatedApplications,
  };
}

interface FallbackSelectionResult {
  readonly selected: ReadonlyArray<UnitAllowedProductsOutput['products'][number]>;
  readonly excluded: ReadonlyArray<ExcludedProduct>;
}

function pickFallbackProducts(
  unit: UnitAllowedProductsOutput,
  config: OrchestratorConfig,
): FallbackSelectionResult {
  const products = unit.products || [];
  const maxProducts =
    typeof config.maxProductsPerUnit === 'number'
      ? config.maxProductsPerUnit
      : config.intensity
        ? INTENSITY_DEFAULTS[config.intensity].maxProductsPerUnit
        : products.length;
  const selected = products.slice(0, maxProducts);
  const excludedProducts = products.slice(maxProducts);
  const excluded: ExcludedProduct[] = excludedProducts.map((product, idx) => {
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    const label = extractLabel(product);
    const category = extractCategory(label);
    return {
      index: maxProducts + idx + 1,
      name,
      regNumber,
      exclusionReason: `Limite massimo prodotti raggiunto (${maxProducts}): priorità inferiore rispetto ai prodotti selezionati`,
      category,
      product,
    };
  });
  return { selected, excluded };
}

/**
 * Result of LLM product selection including excluded products with reasons
 */
interface LlmSelectionResult {
  readonly selected: ReadonlyArray<UnitAllowedProductsOutput['products'][number]>;
  readonly excluded: ReadonlyArray<ExcludedProduct>;
  readonly reason: string | null;
}

/**
 * Uses LLM to SELECT products for a unit.
 * This is the primary selection mechanism (no algorithmic scoring/coverage).
 * Returns both selected products and excluded products with specific reasons.
 *
 * IMPORTANT: If no priorityTargets are specified, ALL products that passed
 * crop matching are included without LLM filtering. This ensures that
 * products like herbicides are not arbitrarily excluded.
 */
async function selectProductsWithLlm(
  unit: UnitAllowedProductsOutput,
  config: OrchestratorConfig,
  context?: DosageAgentContext,
): Promise<LlmSelectionResult> {
  if (config.useLlmForSelection === false) {
    const fallback = pickFallbackProducts(unit, config);
    return { selected: fallback.selected, excluded: fallback.excluded, reason: null };
  }
  const products = unit.products || [];
  if (products.length === 0) {
    return { selected: [], excluded: [], reason: null };
  }

  // Check if priorityTargets are specified
  const hasPriorityTargets =
    Array.isArray(config.priorityTargets) && config.priorityTargets.length > 0;

  // If no priorityTargets specified -> include ALL products without LLM filtering
  // This ensures that products like herbicides are not arbitrarily excluded
  // The conformity checks (disciplinari, SA group limits, active ingredient compatibility)
  // will still filter out non-compliant products downstream
  if (!hasPriorityTargets) {
    console.log(
      `[ORCHESTRATOR] No priorityTargets specified for ${unit.unitProductionId}, including ALL ${products.length} products`,
    );
    return {
      selected: products,
      excluded: [],
      reason:
        'Nessun target prioritario specificato: inclusi tutti i prodotti compatibili con la coltura. I controlli di conformità (disciplinari, principi attivi) verranno applicati successivamente.',
    };
  }

  const parser = StructuredOutputParser.fromZodSchema(LlmProductSelectionSchema);
  const formatInstructions = parser.getFormatInstructions();

  const maxProducts =
    typeof config.maxProductsPerUnit === 'number'
      ? config.maxProductsPerUnit
      : config.intensity
        ? INTENSITY_DEFAULTS[config.intensity].maxProductsPerUnit
        : products.length;
  const intensity = config.intensity ?? null;
  const objective = config.objective || 'balanced';
  const features = products.map((p) => buildProductFeatures(p, config));
  const priorityTargets = Array.isArray(config.priorityTargets) ? config.priorityTargets : [];
  const categoryPriority = config.categoryPriority || DEFAULT_CATEGORY_PRIORITY;
  const notes = config.agronomicNotes ? String(config.agronomicNotes) : '';

  const productList = features
    .map((f, i) => {
      const targets = f.targets.slice(0, 6).join(', ');
      const stockText = f.hasStock ? 'YES' : 'NO';
      return `${i + 1}. ${f.name}
   - category: ${f.category || 'N/A'} (priority order: ${categoryPriority.join(' > ')})
   - targets: ${targets || 'N/A'}
   - FRAC/MoA: ${f.frac || 'N/A'}
   - hasStock: ${stockText}
   - estimatedApplications: ${f.estimatedApplications}`;
    })
    .join('\n');

  // NOTE: This prompt is ONLY used when priorityTargets are specified
  // When no priorityTargets, all products are included without LLM filtering (see check above)
  const prompt = `Sei un agronomo esperto. Devi FILTRARE i prodotti fitosanitari in base ai TARGET PRIORITARI specificati dall'utente.

COLTURA: ${unit.cropName} ${unit.variety || ''}
TARGET PRIORITARI DA COPRIRE: ${priorityTargets.join(', ')}
NOTE AGRONOMICHE (se presenti): "${notes}"

PRODOTTI CANDIDATI (già verificati come compatibili con la coltura):
${productList}

REGOLE DI SELEZIONE:
1. INCLUDI tutti i prodotti che coprono ALMENO UNO dei target prioritari specificati.
2. Se un prodotto copre un target prioritario, DEVE essere incluso (non escluderlo per altri motivi).
3. Escludi SOLO i prodotti che NON coprono NESSUNO dei target prioritari.
4. NON escludere prodotti per motivi come "ridondanza", "stock", "priorità inferiore" - questi controlli sono gestiti altrove.
5. Se la nota agronomica indica esclusioni esplicite (es. "evitare rame"), rispetta la richiesta.
6. Preferisci diversificare i meccanismi d'azione (FRAC/MoA) quando possibile, ma NON escludere prodotti per questo motivo.

IMPORTANTE: I controlli di conformità (disciplinari, limiti principi attivi, compatibilità chimica) sono gestiti da fasi successive del processo. Il tuo compito è SOLO filtrare in base ai target prioritari.

OBBLIGATORIO - MOTIVAZIONI DI ESCLUSIONE:
Per OGNI prodotto NON selezionato, DEVI fornire una entry in "excludedProducts" con:
- "index": l'indice 1-based del prodotto escluso
- "reason": motivazione SPECIFICA che spiega quale target prioritario manca

ESEMPI DI MOTIVAZIONI VALIDE:
- "Non copre nessuno dei target prioritari: [lista target prioritari]. I target del prodotto sono: [lista target prodotto]"
- "Escluso per nota agronomica: [citare la nota e perché il prodotto la viola]"

Rispondi SOLO JSON:
{format_instructions}`;

  try {
    const {
      result: parsed,
      usedModel,
      fallbackUsed,
    } = await callWithFallback<LlmProductSelection>({
      operation: 'orchestrator',
      context,
      execute: async (llm, modelName) => {
        const tracker = usageLogger.createTracker();
        // Include userId/companyId in cache key for data isolation between users
        const userId = context?.userId || 'anonymous';
        const companyId = context?.companyId || null;
        const cacheKey = `orchestrator:${LlmCacheService.createStableHash({
          userId,
          companyId,
          cropName: String(unit.cropName || ''),
          variety: String(unit.variety || ''),
          objective,
          intensity,
          maxProducts,
          priorityTargets: [...priorityTargets].sort(),
          notes,
          modelName,
          promptVersion: ORCHESTRATOR_SELECTION_PROMPT_VERSION,
          candidates: features.map((f) => ({
            name: f.name,
            category: f.category,
            targets: [...f.targets].sort(),
            frac: f.frac,
            hasStock: f.hasStock,
            estimatedApplications: f.estimatedApplications,
          })),
        })}`;

        const cacheResult = await llmCacheService.getOrRefresh<LlmProductSelection>({
          namespace: 'orchestrator-selection',
          cacheKey,
          model: modelName,
          promptVersion: ORCHESTRATOR_SELECTION_PROMPT_VERSION,
          userId: context?.userId,
          computeScore: (payload) => {
            const indices = Array.isArray(payload.selectedIndices) ? payload.selectedIndices : [];
            const hasReason =
              typeof payload.reason === 'string' && payload.reason.trim().length > 0;
            return indices.length + (hasReason ? 1 : 0);
          },
          fetchFresh: async () => {
            const response = await llm.invoke(
              prompt.replace('{format_instructions}', formatInstructions),
              { callbacks: tracker.callbacks },
            );
            const content = extractResponseText(response.content);
            try {
              return await parser.parse(content);
            } catch (primaryErr) {
              const repairPrompt = `You must output ONLY valid JSON that matches these format instructions:
${formatInstructions}

The previous output was invalid. Fix it and output ONLY the corrected JSON.

INVALID_OUTPUT:
${content}`;
              const repaired = await llm.invoke(repairPrompt, {
                callbacks: tracker.callbacks,
              });
              const repairedContent = extractResponseText(repaired.content);
              const reparsed = await parser.parse(repairedContent);
              console.warn(
                `[ORCHESTRATOR] LLM output repaired for ${unit.unitProductionId}: ${primaryErr instanceof Error ? primaryErr.message : String(primaryErr)}`,
              );
              return reparsed;
            }
          },
        });

        await usageLogger.logFromAccumulator(tracker.accumulator, {
          userId: context?.userId,
          companyId: context?.companyId,
          jobId: context?.jobId,
          jobGroupId: context?.jobGroupId,
          jobType: context?.jobType ?? LlmJobType.DOSAGE,
          model: modelName,
          metadata: { step: 'orchestrator-llm-refine', cropName: unit.cropName },
        });

        return cacheResult.payload;
      },
    });

    if (fallbackUsed) {
      console.log(
        `[ORCHESTRATOR] Used fallback provider (${usedModel}) for ${unit.unitProductionId}`,
      );
    }

    const indices: number[] = parsed.selectedIndices;
    const unique = Array.from(new Set(indices))
      .filter((i) => Number.isInteger(i))
      .filter((i) => i >= 1 && i <= products.length)
      .slice(0, maxProducts);
    if (unique.length === 0) {
      console.warn(`[ORCHESTRATOR] LLM returned no selections for ${unit.unitProductionId}`);
      const fallback = pickFallbackProducts(unit, config);
      return { selected: fallback.selected, excluded: fallback.excluded, reason: null };
    }
    const selected = unique.map((i) => products[i - 1]);
    const selectedIndicesSet = new Set(unique);
    const reason: string | null = typeof parsed.reason === 'string' ? parsed.reason : null;

    // Build excluded products with reasons from LLM response
    const llmExcludedReasons = new Map<number, string>();
    if (Array.isArray(parsed.excludedProducts)) {
      for (const excl of parsed.excludedProducts) {
        if (typeof excl.index === 'number' && typeof excl.reason === 'string') {
          llmExcludedReasons.set(excl.index, excl.reason);
        }
      }
    }

    // Create ExcludedProduct objects for all non-selected products
    const excluded: ExcludedProduct[] = [];
    for (let i = 0; i < products.length; i++) {
      const productIndex = i + 1; // 1-based index
      if (!selectedIndicesSet.has(productIndex)) {
        const product = products[i];
        const name = String((product as { name?: string }).name || '');
        const regNumber = String((product as { regNumber?: string }).regNumber || '');
        const label = extractLabel(product);
        const category = extractCategory(label);
        const exclusionReason =
          llmExcludedReasons.get(productIndex) ||
          `Prodotto non selezionato: priorità inferiore rispetto ai prodotti scelti per ${unit.cropName || 'questa coltura'}`;
        excluded.push({
          index: productIndex,
          name,
          regNumber,
          exclusionReason,
          category,
          product,
        });
      }
    }

    console.log(
      `[ORCHESTRATOR] LLM selected ${unit.unitProductionId}: ${products.length} -> ${selected.length} selected, ${excluded.length} excluded (${usedModel}). Reason: ${reason ?? 'N/A'}`,
    );
    return { selected, excluded, reason };
  } catch (err) {
    console.error(`[ORCHESTRATOR] All LLM providers failed for ${unit.unitProductionId}:`, err);
    const fallback = pickFallbackProducts(unit, config);
    return { selected: fallback.selected, excluded: fallback.excluded, reason: null };
  }
}

/**
 * Extended output type that includes excluded products
 */
export interface UnitAllowedProductsWithExcludedOutput extends UnitAllowedProductsOutput {
  readonly excludedProducts: ReadonlyArray<ExcludedProduct>;
}

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

export type { OrchestratorConfig, ExcludedProduct };
