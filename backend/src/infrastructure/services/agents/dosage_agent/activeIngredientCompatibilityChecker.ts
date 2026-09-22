import { Label, LabelResistance, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { callWithFallback, extractResponseText } from './llmProvider';
import { z } from 'zod';
import {
  normalizeActiveIngredient as sharedNormalizeAI,
  activeIngredientMatches,
} from './productAccessors';

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Result of compatibility check for a single product
 */
export interface ProductCompatibilityResult {
  readonly productName: string;
  readonly regNumber: string;
  readonly activeIngredient: string | null;
  readonly isCompatible: boolean;
  readonly incompatibilityReason: string | null;
  readonly isSubstitute: boolean;
  readonly substituteFor: string | null;
  readonly originalDose: number | undefined;
  readonly adjustedDose: number;
  readonly chemicalFamily: string | null;
}

/**
 * Summary of compatibility check for a production unit
 */
export interface UnitCompatibilityCheckResult {
  readonly unitProductionId: string;
  readonly cropName: string | undefined;
  readonly totalProducts: number;
  readonly compatibleProducts: number;
  readonly incompatibleProducts: number;
  readonly substitutesRemoved: number;
  readonly productResults: ReadonlyArray<ProductCompatibilityResult>;
}

interface ProductWithLabel {
  readonly name: string;
  readonly regNumber: string;
  readonly label: Label | null;
  readonly trattamenti?: ReadonlyArray<{
    readonly dose?: number;
    readonly data_distribuzione?: Date;
    readonly epoca_impiego?: string;
    readonly dosaggio_um?: string;
    readonly [key: string]: unknown;
  }>;
}

/**
 * Extracts active ingredient string directly from a Label object.
 * NOTE: This is distinct from productAccessors.extractActiveIngredient which takes a product.
 */
function extractActiveIngredientFromLabel(label: Label | null): string | null {
  if (!label) return null;
  return label.principio_attivo?.trim() || null;
}

/**
 * Extracts chemical family from FRAC/MoA code or composition
 */
function extractChemicalFamily(label: Label | null): string | null {
  if (!label) return null;
  if (label.meccanismo_azione_frac) {
    return label.meccanismo_azione_frac.trim();
  }
  if (label.formulazione) {
    return label.formulazione.trim();
  }
  return null;
}

/**
 * Extracts resistance warnings from label
 */
function extractResistanceWarnings(label: Label | null): ReadonlyArray<LabelResistance> {
  if (!label || !label.resistenze) return [];
  return label.resistenze;
}

// normalizeActiveIngredient imported from shared productAccessors as sharedNormalizeAI

/**
 * Checks if a product should be avoided based on resistance warnings
 */
function checkProductInResistanceWarnings(
  productName: string,
  activeIngredient: string | null,
  chemicalFamily: string | null,
  resistances: ReadonlyArray<LabelResistance>,
): { isIncompatible: boolean; reason: string | null } {
  for (const resistance of resistances) {
    // Check products to avoid
    if (resistance.prodotti_da_evitare) {
      for (const avoidProduct of resistance.prodotti_da_evitare) {
        const normAvoid = sharedNormalizeAI(avoidProduct);
        const normProduct = sharedNormalizeAI(productName);
        const normAI = sharedNormalizeAI(activeIngredient);
        if (
          normAvoid &&
          (activeIngredientMatches(normProduct, normAvoid) ||
            (normAI && activeIngredientMatches(normAI, normAvoid)))
        ) {
          return {
            isIncompatible: true,
            reason: `Prodotto "${productName}" contiene principio attivo da evitare: ${avoidProduct}. ${resistance.raccomandazioni || ''}`,
          };
        }
      }
    }
    // Check chemical families to avoid
    if (resistance.famiglie_chimiche_da_evitare && chemicalFamily) {
      for (const avoidFamily of resistance.famiglie_chimiche_da_evitare) {
        const normAvoidFamily = sharedNormalizeAI(avoidFamily);
        const normFamily = sharedNormalizeAI(chemicalFamily);
        if (activeIngredientMatches(normFamily, normAvoidFamily)) {
          return {
            isIncompatible: true,
            reason: `Prodotto "${productName}" appartiene alla famiglia chimica da evitare: ${avoidFamily}. ${resistance.raccomandazioni || ''}`,
          };
        }
      }
    }
  }
  return { isIncompatible: false, reason: null };
}

/**
 * Builds prompt for LLM compatibility check
 */
function buildCompatibilityPrompt(products: ReadonlyArray<ProductWithLabel>): string {
  const productDescriptions = products
    .map((p, idx) => {
      const ai = extractActiveIngredientFromLabel(p.label);
      const cf = extractChemicalFamily(p.label);
      const resistances = extractResistanceWarnings(p.label);
      const resistanceText =
        resistances.length > 0
          ? resistances
              .map((r) => {
                const parts = [];
                if (r.prodotti_da_evitare?.length) {
                  parts.push(`Prodotti da evitare: ${r.prodotti_da_evitare.join(', ')}`);
                }
                if (r.famiglie_chimiche_da_evitare?.length) {
                  parts.push(`Famiglie da evitare: ${r.famiglie_chimiche_da_evitare.join(', ')}`);
                }
                if (r.raccomandazioni) {
                  parts.push(`Raccomandazioni: ${r.raccomandazioni}`);
                }
                return parts.join('. ');
              })
              .join(' | ')
          : 'Nessuna';
      const compatibilityNote = p.label?.compatibilita || 'Non specificata';
      return `${idx + 1}. "${p.name}" (Reg: ${p.regNumber})
   - Principio attivo: ${ai || 'Non disponibile'}
   - Meccanismo d'azione/FRAC: ${cf || 'Non disponibile'}
   - Categoria: ${p.label?.categoria || 'Non disponibile'}
   - Compatibilità dichiarata: ${compatibilityNote}
   - Avvertenze resistenze: ${resistanceText}`;
    })
    .join('\n\n');

  return `Sei un agronomo esperto in fitofarmaci. Analizza la compatibilità tra i seguenti prodotti fitosanitari che saranno applicati sullo stesso campo.

PRODOTTI DA ANALIZZARE:
${productDescriptions}

ANALISI RICHIESTA:
1. INCOMPATIBILITÀ CHIMICHE: Identifica prodotti che NON possono essere miscelati o applicati insieme a causa di:
   - Interazioni chimiche negative tra principi attivi
   - Avvertenze esplicite nelle resistenze (prodotti_da_evitare, famiglie_chimiche_da_evitare)
   - Note di compatibilità che escludono altri prodotti

2. Per ogni incompatibilità trovata, indica:
   - Quale prodotto MANTENERE (con motivazione)
   - Quale prodotto ESCLUDERE (dose = 0)

IMPORTANTE - NON ESCLUDERE SOSTITUTI:
- Prodotti con lo stesso principio attivo o meccanismo d'azione NON devono essere esclusi automaticamente.
- L'utente ha scelto questi prodotti intenzionalmente. Mantienili tutti a meno che non ci sia una reale incompatibilità chimica.
- Prodotti con stesso principio attivo possono coesistere: i limiti SA vengono gestiti separatamente.

Rispondi in JSON con questo formato esatto:
{
  "analysis": [
    {
      "productName": "nome prodotto",
      "regNumber": "numero registrazione",
      "decision": "KEEP" | "EXCLUDE",
      "reason": "motivazione dettagliata",
      "incompatibleWith": ["lista prodotti incompatibili"] | null,
      "isSubstituteOf": null
    }
  ],
  "summary": "Riepilogo delle decisioni prese",
  "totalExcluded": numero
}

IMPORTANTE:
- Se non ci sono incompatibilità chimiche reali, tutti i prodotti devono avere decision="KEEP"
- NON escludere prodotti solo perché condividono lo stesso principio attivo
- Documenta sempre il motivo dell'esclusione per tracciabilità`;
}

const LlmCompatibilityResultSchema = z.object({
  analysis: z.array(
    z.object({
      productName: z.string(),
      regNumber: z.string(),
      decision: z.enum(['KEEP', 'EXCLUDE']),
      reason: z.string(),
      incompatibleWith: z.array(z.string()).nullable(),
      isSubstituteOf: z.string().nullable(),
    }),
  ),
  summary: z.string(),
  totalExcluded: z.number().int().min(0),
});

type LlmCompatibilityResult = z.infer<typeof LlmCompatibilityResultSchema>;

/**
 * Invokes LLM for compatibility check
 */
async function invokeLlmCompatibilityCheck(
  products: ReadonlyArray<ProductWithLabel>,
  context?: DosageAgentContext,
): Promise<LlmCompatibilityResult | null> {
  if (products.length < 2) {
    // No need to check compatibility with single product
    return null;
  }

  const prompt = buildCompatibilityPrompt(products);

  try {
    console.log(`[COMPATIBILITY-CHECK] Invoking LLM for ${products.length} products`);
    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);

    const { result: parsed, usedModel } = await callWithFallback<LlmCompatibilityResult | null>({
      operation: 'compatibility-check',
      context,
      modelOptions: { temperature: 0.1, maxTokens: 4000 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: [usageCollector] });
        const content = extractResponseText(response.content);

        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn('[COMPATIBILITY-CHECK] Could not extract JSON from LLM response');
          return null;
        }

        const rawParsed = JSON.parse(jsonMatch[0]);
        const validation = LlmCompatibilityResultSchema.safeParse(rawParsed);
        if (!validation.success) {
          console.warn(
            `[COMPATIBILITY-CHECK] LLM response failed schema validation: ${validation.error.message}`,
          );
          return null;
        }
        return validation.data;
      },
    });

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        userId: context?.userId,
        companyId: context?.companyId,
        jobId: context?.jobId,
        jobGroupId: context?.jobGroupId,
        jobType: context?.jobType ?? LlmJobType.DOSAGE,
        model: usedModel,
        metadata: { step: 'active-ingredient-compatibility-check', productCount: products.length },
      })
      .catch((err) => console.warn('[COMPATIBILITY-CHECK] Failed to log usage:', err));

    if (parsed && hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logFlow({
        jobId: context.jobId,
        userId: context.userId,
        message: `Compatibility check completed: ${parsed.totalExcluded} products excluded`,
        metadata: { summary: parsed.summary },
      });
    }

    return parsed;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[COMPATIBILITY-CHECK] LLM error: ${errMsg}`);
    return null;
  }
}

/**
 * Performs rule-based compatibility check before LLM
 */
function performRuleBasedCheck(
  products: ReadonlyArray<ProductWithLabel>,
): Map<string, ProductCompatibilityResult> {
  const results = new Map<string, ProductCompatibilityResult>();
  const activeIngredients = new Map<string, ProductWithLabel[]>();

  // Group products by normalized active ingredient
  for (const product of products) {
    const ai = extractActiveIngredientFromLabel(product.label);
    const normalizedAI = sharedNormalizeAI(ai);
    const key = `${product.name}|${product.regNumber}`;

    if (normalizedAI) {
      if (!activeIngredients.has(normalizedAI)) {
        activeIngredients.set(normalizedAI, []);
      }
      activeIngredients.get(normalizedAI)!.push(product);
    }

    // Initialize result
    results.set(key, {
      productName: product.name,
      regNumber: product.regNumber,
      activeIngredient: ai,
      isCompatible: true,
      incompatibilityReason: null,
      isSubstitute: false,
      substituteFor: null,
      originalDose: product.trattamenti?.[0]?.dose,
      adjustedDose: product.trattamenti?.[0]?.dose ?? 0,
      chemicalFamily: extractChemicalFamily(product.label),
    });
  }

  // Log shared active ingredients as informational note (do NOT exclude - user chose these products)
  for (const [normalizedAI, productsWithSameAI] of activeIngredients) {
    if (productsWithSameAI.length > 1) {
      const names = productsWithSameAI.map((p) => p.name);
      console.log(
        `[COMPATIBILITY-CHECK] Info: ${productsWithSameAI.length} products share active ingredient "${normalizedAI}": ${names.join(', ')}. Keeping all as user-selected.`,
      );
    }
  }

  // Check resistance warnings for each product against all others
  for (const product of products) {
    const resistances = extractResistanceWarnings(product.label);
    if (resistances.length === 0) continue;

    for (const otherProduct of products) {
      if (product.name === otherProduct.name && product.regNumber === otherProduct.regNumber) {
        continue;
      }

      const otherAI = extractActiveIngredientFromLabel(otherProduct.label);
      const otherCF = extractChemicalFamily(otherProduct.label);
      const check = checkProductInResistanceWarnings(
        otherProduct.name,
        otherAI,
        otherCF,
        resistances,
      );

      if (check.isIncompatible) {
        const key = `${otherProduct.name}|${otherProduct.regNumber}`;
        const existing = results.get(key);
        if (existing && existing.isCompatible) {
          results.set(key, {
            ...existing,
            isCompatible: false,
            incompatibilityReason: check.reason,
            adjustedDose: 0,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Main function to check active ingredient compatibility for products on a field
 */
export async function checkActiveIngredientCompatibility(
  unit: UnitAllowedProductsWithDosageOutput,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
): Promise<UnitCompatibilityCheckResult> {
  const products = unit.products || [];
  console.log(
    `[COMPATIBILITY-CHECK] Checking ${products.length} products for unit ${unit.unitProductionId}`,
  );

  // Extract products with their labels
  const productsWithLabels: ProductWithLabel[] = products.map((p) => ({
    name: String((p as { name?: string }).name || ''),
    regNumber: String((p as { regNumber?: string }).regNumber || ''),
    label: isFitoLabel((p as { label?: unknown }).label)
      ? ((p as { label: Label }).label as Label)
      : null,
    trattamenti: (p as { trattamenti?: unknown[] }).trattamenti as ProductWithLabel['trattamenti'],
  }));

  if (productsWithLabels.length < 2) {
    console.log('[COMPATIBILITY-CHECK] Less than 2 products, skipping check');
    return {
      unitProductionId: unit.unitProductionId,
      cropName: unit.cropName,
      totalProducts: productsWithLabels.length,
      compatibleProducts: productsWithLabels.length,
      incompatibleProducts: 0,
      substitutesRemoved: 0,
      productResults: productsWithLabels.map((p) => ({
        productName: p.name,
        regNumber: p.regNumber,
        activeIngredient: extractActiveIngredientFromLabel(p.label),
        isCompatible: true,
        incompatibilityReason: null,
        isSubstitute: false,
        substituteFor: null,
        originalDose: p.trattamenti?.[0]?.dose,
        adjustedDose: p.trattamenti?.[0]?.dose ?? 0,
        chemicalFamily: extractChemicalFamily(p.label),
      })),
    };
  }

  // First: rule-based check
  const ruleBasedResults = performRuleBasedCheck(productsWithLabels);

  // Count rule-based incompatibilities
  const ruleBasedIncompatible = Array.from(ruleBasedResults.values()).filter(
    (r) => !r.isCompatible,
  );

  if (ruleBasedIncompatible.length > 0) {
    console.log(
      `[COMPATIBILITY-CHECK] Rule-based check found ${ruleBasedIncompatible.length} incompatibilities`,
    );
  }

  // Second: LLM check for additional analysis
  let llmResults: LlmCompatibilityResult | null = null;
  try {
    llmResults = await invokeLlmCompatibilityCheck(productsWithLabels, context);
  } catch (error) {
    console.warn('[COMPATIBILITY-CHECK] LLM check failed, using rule-based results only');
  }

  // Merge results: LLM takes precedence for additional exclusions
  const finalResults = new Map(ruleBasedResults);

  if (llmResults) {
    for (const llmResult of llmResults.analysis) {
      const key = `${llmResult.productName}|${llmResult.regNumber}`;
      const existing = finalResults.get(key);

      if (llmResult.decision === 'EXCLUDE' && existing) {
        // Skip exclusions based only on being a substitute (same AI) - user chose these products
        if (llmResult.isSubstituteOf !== null && !llmResult.incompatibleWith?.length) {
          console.log(
            `[COMPATIBILITY-CHECK] Ignoring LLM substitute exclusion for "${llmResult.productName}" - user-selected product kept.`,
          );
          continue;
        }
        if (existing.isCompatible) {
          // LLM found actual chemical incompatibility
          finalResults.set(key, {
            ...existing,
            isCompatible: false,
            incompatibilityReason: llmResult.reason,
            isSubstitute: false,
            substituteFor: null,
            adjustedDose: 0,
          });
        }
      }
    }
  }

  // Log to history
  const productResults = Array.from(finalResults.values());
  for (const result of productResults) {
    if (!result.isCompatible && historyManager) {
      const productKey = `${result.productName}|${result.regNumber}`;
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Prodotto escluso: Incompatibilità principio attivo',
        result.incompatibilityReason || 'Incompatibilità rilevata',
        DosageAgentStep.ACTIVE_INGREDIENT_COMPATIBILITY,
        DataSource.LABEL_EXTRACTION,
        {
          productionUnitId: unit.unitProductionId,
          cropName: unit.cropName,
          variety: unit.variety,
          productName: result.productName,
          productRegistrationNumber: result.regNumber,
          description: `Principio attivo: ${result.activeIngredient || 'N/A'}. Famiglia chimica: ${result.chemicalFamily || 'N/A'}. Dose originale: ${result.originalDose || 'N/A'}, Dose finale: 0`,
        },
      );
    }
  }

  const incompatibleCount = productResults.filter((r) => !r.isCompatible).length;
  const substitutesCount = productResults.filter((r) => r.isSubstitute).length;

  console.log(
    `[COMPATIBILITY-CHECK] Unit ${unit.unitProductionId}: ${incompatibleCount} incompatible, ${substitutesCount} substitutes`,
  );

  return {
    unitProductionId: unit.unitProductionId,
    cropName: unit.cropName,
    totalProducts: productResults.length,
    compatibleProducts: productResults.filter((r) => r.isCompatible).length,
    incompatibleProducts: incompatibleCount,
    substitutesRemoved: substitutesCount,
    productResults,
  };
}

/**
 * Applies compatibility check results to unit products, setting dose to 0 for incompatible products
 */
export function applyCompatibilityResults(
  unit: UnitAllowedProductsWithDosageOutput,
  checkResult: UnitCompatibilityCheckResult,
): UnitAllowedProductsWithDosageOutput {
  const incompatibleMap = new Map(
    checkResult.productResults
      .filter((r) => !r.isCompatible)
      .map((r) => [`${r.productName}|${r.regNumber}`, r]),
  );

  if (incompatibleMap.size === 0) {
    return unit;
  }

  const updatedProducts = (unit.products || []).map((product) => {
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    const key = `${name}|${regNumber}`;
    const incompatibleResult = incompatibleMap.get(key);

    if (!incompatibleResult) {
      return product;
    }

    // Set all treatments to dose 0 with note explaining why
    const trattamenti = (product as { trattamenti?: ReadonlyArray<Record<string, unknown>> })
      .trattamenti;
    if (!trattamenti || trattamenti.length === 0) {
      return product;
    }

    const updatedTrattamenti = trattamenti.map((t) => ({
      ...t,
      dose: 0,
      note: buildExclusionNote(incompatibleResult, t.note as string | undefined),
    }));

    return {
      ...product,
      trattamenti: updatedTrattamenti,
    };
  });

  return {
    ...unit,
    products: updatedProducts,
  };
}

/**
 * Builds the exclusion note for a treatment
 */
function buildExclusionNote(result: ProductCompatibilityResult, existingNote?: string): string {
  const parts: string[] = [];

  if (existingNote) {
    parts.push(existingNote);
  }

  parts.push(`[ESCLUSO] Incompatibilità principio attivo. ${result.incompatibilityReason || ''}`);
  parts.push('Dose impostata a 0 per storico e tracciabilità.');

  return parts.join(' ');
}

/**
 * Main flow function to check and apply compatibility for all units
 */
export async function flowCheckActiveIngredientCompatibility(
  units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
): Promise<ReadonlyArray<UnitAllowedProductsWithDosageOutput>> {
  console.log(`[COMPATIBILITY-FLOW] Starting compatibility check for ${units.length} units`);
  const startTime = Date.now();

  const results: UnitAllowedProductsWithDosageOutput[] = [];

  for (const unit of units) {
    const checkResult = await checkActiveIngredientCompatibility(unit, historyManager, context);
    const adjustedUnit = applyCompatibilityResults(unit, checkResult);
    results.push(adjustedUnit);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[COMPATIBILITY-FLOW] Completed in ${elapsed}ms`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    const totalExcluded = results.reduce((sum, r) => {
      const excludedCount = (r.products || []).filter((p) => {
        const trattamenti = (p as { trattamenti?: ReadonlyArray<{ dose?: number }> }).trattamenti;
        return trattamenti?.every((t) => t.dose === 0);
      }).length;
      return sum + excludedCount;
    }, 0);

    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Active ingredient compatibility check completed`,
      metadata: {
        unitsProcessed: units.length,
        totalExcluded,
        elapsedMs: elapsed,
      },
    });
  }

  return results;
}
