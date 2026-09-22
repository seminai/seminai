import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import type { OrchestratorConfig, ExcludedProduct } from './types';
import { DosageAgentContext } from './context';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmCacheService } from './llmCacheService';
import { LlmJobType } from '@prisma/client';
import { DEFAULT_CATEGORY_PRIORITY, INTENSITY_DEFAULTS, LlmProductSelection, LlmProductSelectionSchema, LlmSelectionResult, ORCHESTRATOR_SELECTION_PROMPT_VERSION, buildProductFeatures, extractCategory, extractLabel, llmCacheService, pickFallbackProducts, usageLogger } from './flowOrchestrateProductSelection.part-01-usage-logger';

/**
 * Uses LLM to SELECT products for a unit.
 * This is the primary selection mechanism (no algorithmic scoring/coverage).
 * Returns both selected products and excluded products with specific reasons.
 *
 * IMPORTANT: If no priorityTargets are specified, ALL products that passed
 * crop matching are included without LLM filtering. This ensures that
 * products like herbicides are not arbitrarily excluded.
 */
export async function selectProductsWithLlm(
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
