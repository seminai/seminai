import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { DosageAgentContext } from './context';
import { RulesRagService } from '../../rag/RulesRagService';
import {
  RuleViolationDetail,
  ProductComplianceValidation,
  DisciplinareActiveIngredientInfo,
} from '../../../../domain/dtos/rule-rag.types';
import type {
  AppliedRulePayload,
  AppliedRuleAdjustment,
} from '../../../../domain/dtos/applied-rules.dto';
import { CompanyRulesService } from './companyRulesService';
import { DisciplinareInfoExtractor } from '../../rag/DisciplinareInfoExtractor';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import {
  extractProductName,
  extractActiveIngredient,
  extractTreatments,
  getActiveTreatments,
  type TreatmentView,
  buildDisciplinareInfoKey,
} from './productAccessors';
import { resolveCropNamesForDisciplinare } from '../shared/cropNameResolver';
import { createChatModel } from '../../llm-model-factory';
import {
  buildAppliedRulesForProduct,
  citationsFromComplianceResults,
  groupViolationsByRule,
} from './appliedRulesBuilder';

/**
 * Builds the lookup key used by appliedRulesByProduct.
 */
export function buildAppliedRulesKey(unitProductionId: string, productName: string): string {
  return `${unitProductionId}|${productName.trim().toLowerCase()}`;
}

/**
 * Result of the rules compliance validation flow.
 */
interface RulesComplianceFlowResult {
  readonly output: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly violations: ReadonlyArray<RuleViolationDetail>;
  readonly disciplinareInfoMap: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>;
  readonly appliedRulesByProduct: Map<string, ReadonlyArray<AppliedRulePayload>>;
}

/**
 * LLM response for treatment adjustment.
 */
interface TreatmentAdjustmentResult {
  max_trattamenti_consentiti: number;
  indici_da_mantenere: number[];
  motivazione: string;
  nota_per_agronomo: string;
}

/**
 * Validates products and dosages against vectorized rule PDFs (DISCIPLINARE, STANDARD, METHODOLOGY).
 *
 * Flow:
 * 1. Resolve crop names for disciplinare matching
 * 2. Extract structured disciplinare info (LLM) for each unique active ingredient + crop pair
 * 3. Validate each product/treatment against RAG chunks (collect violations)
 * 4. For products with violations: use LLM + disciplinare_info to intelligently adjust treatments
 *
 * Returns the output with adjusted dosages and a list of violations.
 */
export async function flowValidateRulesCompliance(
  context: DosageAgentContext | undefined,
  input: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
): Promise<RulesComplianceFlowResult> {
  const emptyMap = new Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>();
  const emptyAppliedMap = new Map<string, ReadonlyArray<AppliedRulePayload>>();
  if (!context?.companyId) {
    console.log('[RULES-COMPLIANCE] No companyId in context, skipping rules compliance check');
    return {
      output: [...input],
      violations: [],
      disciplinareInfoMap: emptyMap,
      appliedRulesByProduct: emptyAppliedMap,
    };
  }
  const companyRulesService = new CompanyRulesService();
  const vectorizedRules = await companyRulesService.getVectorizedRulesForCompany(context.companyId);
  if (vectorizedRules.length === 0) {
    console.log('[RULES-COMPLIANCE] No vectorized rules found for company, skipping');
    return {
      output: [...input],
      violations: [],
      disciplinareInfoMap: emptyMap,
      appliedRulesByProduct: emptyAppliedMap,
    };
  }
  const companyRuleIds: ReadonlySet<string> = new Set(vectorizedRules.map((r) => r.id));
  const workspaceId = vectorizedRules[0].workspaceId;
  console.log(
    `[RULES-COMPLIANCE] Validating against ${vectorizedRules.length} vectorized rules ` +
      `for company ${context.companyId}`,
  );
  const ragService = new RulesRagService();

  // Phase 1: Resolve crop names for disciplinare matching (e.g., "vite" → "Vite da uva da vino")
  const hasDisciplinare = vectorizedRules.some((r) => r.category === 'DISCIPLINARE');
  const uniqueCropNames = [
    ...new Set(input.map((u) => u.cropName).filter((cn): cn is string => Boolean(cn))),
  ];
  let resolvedCropNames = new Map<string, string>();
  if (hasDisciplinare && uniqueCropNames.length > 0) {
    console.log(
      `[RULES-COMPLIANCE] Resolving ${uniqueCropNames.length} crop names for disciplinare matching...`,
    );
    resolvedCropNames = await resolveCropNamesForDisciplinare({
      cropNames: uniqueCropNames,
      ragService,
      companyId: context.companyId,
      workspaceId,
    });
    for (const [short, full] of resolvedCropNames) {
      if (short !== full) {
        console.log(`[RULES-COMPLIANCE] Crop name resolved: "${short}" → "${full}"`);
      }
    }
  }

  // Phase 2: Extract structured disciplinare info BEFORE validation
  const disciplinareInfoMap = await extractDisciplinareInfo({
    input,
    vectorizedRules,
    ragService,
    companyId: context.companyId,
    workspaceId,
    context,
    resolvedCropNames,
  });

  // Phase 3: Validate all products and collect violations
  const allViolations: RuleViolationDetail[] = [];
  const appliedRulesByProduct = new Map<string, ReadonlyArray<AppliedRulePayload>>();
  const updatedUnits: UnitAllowedProductsWithDosageOutput[] = [];
  for (const unit of input) {
    const updatedProducts = [];
    const resolvedCropName =
      resolvedCropNames.get(unit.cropName ?? '') ?? unit.cropName ?? 'unknown';
    for (const product of unit.products) {
      const trattamenti = extractTreatments(product);
      if (trattamenti.length === 0) {
        updatedProducts.push({ ...product, trattamenti: [...trattamenti] });
        continue;
      }
      const productName = extractProductName(product);
      const activeIngredient = extractActiveIngredient(product);
      if (!productName || !activeIngredient) {
        console.log(
          `[RULES-COMPLIANCE] Skipping product (no name/ingredient): name=${productName}, ai=${activeIngredient}`,
        );
        updatedProducts.push({ ...product, trattamenti: [...trattamenti] });
        continue;
      }
      const productViolations: RuleViolationDetail[] = [];
      for (const trattamento of trattamenti) {
        const dose = trattamento.dose;
        const doseUm = trattamento.dosaggio_um;
        const dataDistribuzione = trattamento.data_distribuzione;
        if (!dose || !doseUm) continue;
        const applicationDate = dataDistribuzione ? new Date(dataDistribuzione) : new Date();
        try {
          const validation: ProductComplianceValidation =
            await ragService.validateProductCompliance({
              companyId: context.companyId,
              workspaceId,
              productName,
              activeIngredient,
              dose,
              doseUnit: doseUm,
              applicationDate,
              cropName: resolvedCropName,
              maxApplications: trattamenti.length,
            });
          if (!validation.isCompliant) {
            productViolations.push(...validation.violations);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.warn(`[RULES-COMPLIANCE] Error validating ${productName}: ${errorMessage}`);
        }
      }

      // Phase 4: Adjust treatments if violations found
      let adjustmentSummary: { motivazione: string; notaPerAgronomo: string } | undefined;
      let trattamentiPostAdjust: ReadonlyArray<TreatmentView> = trattamenti;
      if (productViolations.length > 0) {
        const uniqueViolations = deduplicateViolations(productViolations);
        allViolations.push(...uniqueViolations);

        const disciplinareInfo = disciplinareInfoMap.get(
          buildDisciplinareInfoKey(activeIngredient, resolvedCropName),
        );

        if (disciplinareInfo && disciplinareInfo.length > 0) {
          // LLM-based intelligent adjustment using structured disciplinare data
          console.log(
            `[RULES-COMPLIANCE] Using LLM to adjust ${productName} treatments based on disciplinare constraints`,
          );
          // Compute group context: how many active treatments do OTHER products in this unit
          // share in the same SA group? This lets the LLM account for shared group limits.
          const groupSANames = disciplinareInfo.flatMap((i) => i.gruppo_sostanze_attive);
          const otherGroupProducts: {
            productName: string;
            activeIngredient: string;
            activeTreatmentCount: number;
          }[] = [];
          if (groupSANames.length > 0) {
            for (const otherProduct of unit.products) {
              if (otherProduct === product) continue;
              const otherAI = extractActiveIngredient(otherProduct);
              if (!otherAI) continue;
              const otherInfo = disciplinareInfoMap.get(
                buildDisciplinareInfoKey(otherAI, resolvedCropName),
              );
              if (!otherInfo) continue;
              const otherGroupNames = otherInfo.flatMap((i) => i.gruppo_sostanze_attive);
              const sharesGroup = groupSANames.some((g) => otherGroupNames.includes(g));
              if (sharesGroup) {
                otherGroupProducts.push({
                  productName: extractProductName(otherProduct) ?? 'unknown',
                  activeIngredient: otherAI,
                  activeTreatmentCount: getActiveTreatments(otherProduct).length,
                });
              }
            }
          }

          const adjustResult = await adjustTreatmentsWithLlm({
            productName,
            activeIngredient,
            cropName: resolvedCropName,
            trattamenti,
            disciplinareInfo,
            violations: uniqueViolations,
            otherGroupProducts: otherGroupProducts.length > 0 ? otherGroupProducts : undefined,
          });
          adjustmentSummary = adjustResult.summary;
          trattamentiPostAdjust = adjustResult.trattamenti;
          updatedProducts.push({ ...product, trattamenti: adjustResult.trattamenti });
        } else {
          // No disciplinare info available — keep all treatments with violation notes
          // (don't zero doses without reliable data to base the decision on)
          const noteText = formatViolationsAsNote(uniqueViolations);
          const updatedTrattamenti = trattamenti.map((t) => ({
            ...t,
            note: [t.note, noteText].filter(Boolean).join('\n'),
          }));
          trattamentiPostAdjust = updatedTrattamenti;
          updatedProducts.push({ ...product, trattamenti: updatedTrattamenti });
        }
      } else {
        // No violations — still create a shallow copy to prevent shared mutable references
        // with the input (downstream steps like SA group limits mutate trattamenti)
        updatedProducts.push({ ...product, trattamenti: [...trattamenti] });
      }

      // Build appliedRules payload for this product
      const appliedRules = await buildAppliedRulesForProductInFlow({
        ragService,
        vectorizedRules,
        companyRuleIds,
        companyId: context.companyId,
        workspaceId,
        productName,
        activeIngredient,
        resolvedCropName,
        productViolations,
        trattamentiPre: trattamenti,
        trattamentiPost: trattamentiPostAdjust,
        adjustmentSummary,
      });
      if (appliedRules.length > 0) {
        appliedRulesByProduct.set(
          buildAppliedRulesKey(unit.unitProductionId, productName),
          appliedRules,
        );
      }
    }
    updatedUnits.push({
      ...unit,
      products: updatedProducts,
    } as UnitAllowedProductsWithDosageOutput);
  }
  console.log(
    `[RULES-COMPLIANCE] Validation complete: ${allViolations.length} violations found ` +
      `(${allViolations.filter((v) => v.severity === 'CRITICAL').length} critical)`,
  );

  return {
    output: updatedUnits,
    violations: allViolations,
    disciplinareInfoMap,
    appliedRulesByProduct,
  };
}

/**
 * Builds the AppliedRulePayload[] for a single product, fetching citations from RAG
 * and aggregating violations + LLM adjustment summary.
 */
async function buildAppliedRulesForProductInFlow(params: {
  readonly ragService: RulesRagService;
  readonly vectorizedRules: ReadonlyArray<{
    id: string;
    name: string;
    category: import('@prisma/client').RuleCategory;
    workspaceId: string;
    pdfFileUrl: string | null;
  }>;
  readonly companyRuleIds: ReadonlySet<string>;
  readonly companyId: string;
  readonly workspaceId: string;
  readonly productName: string;
  readonly activeIngredient: string;
  readonly resolvedCropName: string;
  readonly productViolations: ReadonlyArray<RuleViolationDetail>;
  readonly trattamentiPre: ReadonlyArray<TreatmentView>;
  readonly trattamentiPost: ReadonlyArray<TreatmentView>;
  readonly adjustmentSummary?: { motivazione: string; notaPerAgronomo: string };
}): Promise<ReadonlyArray<AppliedRulePayload>> {
  const {
    ragService,
    vectorizedRules,
    companyRuleIds,
    companyId,
    workspaceId,
    productName,
    activeIngredient,
    resolvedCropName,
    productViolations,
    trattamentiPre,
    trattamentiPost,
    adjustmentSummary,
  } = params;
  if (vectorizedRules.length === 0) return [];

  let citationsByRuleId = new Map<
    string,
    ReadonlyArray<import('../../../../domain/dtos/applied-rules.dto').AppliedRuleCitation>
  >();
  try {
    const ragResults = await ragService.queryRulesForCompliance({
      companyId,
      workspaceId,
      query: `${productName} ${activeIngredient} ${resolvedCropName} dose interventi limitazioni`,
      k: 8,
    });
    citationsByRuleId = citationsFromComplianceResults(ragResults);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RULES-COMPLIANCE] Citation fetch failed for ${productName}: ${msg}`);
  }

  const violationsByRuleId = groupViolationsByRule(productViolations);

  const adjustments = buildAdjustmentsForProduct({
    productName,
    activeIngredient,
    trattamentiPre,
    trattamentiPost,
    adjustmentSummary,
  });
  const adjustmentsByRuleId = new Map<string, ReadonlyArray<AppliedRuleAdjustment>>();
  if (adjustments.length > 0) {
    const ruleIdsTouched = new Set<string>(
      productViolations.filter((v) => v.severity === 'CRITICAL').map((v) => v.ruleId),
    );
    for (const ruleId of ruleIdsTouched) {
      adjustmentsByRuleId.set(ruleId, adjustments);
    }
  }

  // Only include rules that actually had a signal: violation, citation, or adjustment.
  const relevantRules = vectorizedRules.filter(
    (r) =>
      violationsByRuleId.has(r.id) ||
      (citationsByRuleId.get(r.id)?.length ?? 0) > 0 ||
      adjustmentsByRuleId.has(r.id),
  );

  return buildAppliedRulesForProduct({
    rules: relevantRules,
    companyRuleIds,
    violationsByRuleId,
    citationsByRuleId,
    adjustmentsByRuleId,
  });
}

/**
 * Derives adjustment entries from pre/post treatment lists.
 * A treatment is considered "removed" when its dose was zeroed by the LLM.
 */
function buildAdjustmentsForProduct(params: {
  readonly productName: string;
  readonly activeIngredient: string;
  readonly trattamentiPre: ReadonlyArray<TreatmentView>;
  readonly trattamentiPost: ReadonlyArray<TreatmentView>;
  readonly adjustmentSummary?: { motivazione: string; notaPerAgronomo: string };
}): AppliedRuleAdjustment[] {
  const { productName, activeIngredient, trattamentiPre, trattamentiPost, adjustmentSummary } =
    params;
  if (!adjustmentSummary) return [];
  const keptCount = trattamentiPost.filter((t) => (t.dose ?? 0) > 0).length;
  const removedCount = Math.max(0, trattamentiPre.length - keptCount);
  if (removedCount === 0 && !adjustmentSummary.motivazione) return [];
  return [
    {
      productName,
      activeIngredient,
      treatmentsKept: keptCount,
      treatmentsRemoved: removedCount,
      motivazione: adjustmentSummary.motivazione,
      notaPerAgronomo: adjustmentSummary.notaPerAgronomo || undefined,
    },
  ];
}

/**
 * Uses LLM to intelligently adjust treatments based on disciplinare constraints.
 * The LLM receives the structured disciplinare data (n_max_interventi_sa, n_max_interventi_gruppo, etc.)
 * and decides which treatments to keep and which to exclude.
 */
interface AdjustTreatmentsResult {
  readonly trattamenti: TreatmentView[];
  readonly summary?: {
    readonly motivazione: string;
    readonly notaPerAgronomo: string;
  };
}

async function adjustTreatmentsWithLlm(params: {
  productName: string;
  activeIngredient: string;
  cropName: string;
  trattamenti: ReadonlyArray<TreatmentView>;
  disciplinareInfo: ReadonlyArray<DisciplinareActiveIngredientInfo>;
  violations: ReadonlyArray<RuleViolationDetail>;
  otherGroupProducts?: ReadonlyArray<{
    productName: string;
    activeIngredient: string;
    activeTreatmentCount: number;
  }>;
}): Promise<AdjustTreatmentsResult> {
  const {
    productName,
    activeIngredient,
    cropName,
    trattamenti,
    disciplinareInfo,
    violations,
    otherGroupProducts,
  } = params;

  const treatmentsSummary = trattamenti.map((t, i) => ({
    indice: i,
    data_distribuzione: t.data_distribuzione,
    dose: t.dose,
    dosaggio_um: t.dosaggio_um,
    epoca_impiego: t.application ?? t.epoca_impiego ?? null,
  }));

  const constraints = disciplinareInfo.map((info) => ({
    n_max_interventi_sa: info.n_max_interventi_sa,
    n_max_interventi_sa_scope: info.n_max_interventi_sa_scope,
    n_max_interventi_gruppo: info.n_max_interventi_gruppo,
    n_max_interventi_gruppo_scope: info.n_max_interventi_gruppo_scope,
    gruppo_sostanze_attive: info.gruppo_sostanze_attive,
    limitazioni_uso_e_note: info.limitazioni_uso_e_note,
  }));

  const violationsSummary = violations.map((v) => ({
    tipo: v.violationType,
    descrizione: v.description,
    azione_suggerita: v.suggestedAction,
  }));

  const prompt = `Sei un agronomo esperto di disciplinari di produzione integrata italiani.
Devi decidere come adeguare i trattamenti pianificati ai vincoli del disciplinare.

PRODOTTO: ${productName}
PRINCIPIO ATTIVO: ${activeIngredient}
COLTURA: ${cropName}

TRATTAMENTI PIANIFICATI (${trattamenti.length}):
${JSON.stringify(treatmentsSummary, null, 2)}

VINCOLI DAL DISCIPLINARE:
${JSON.stringify(constraints, null, 2)}

VIOLAZIONI RILEVATE DAL SISTEMA:
${JSON.stringify(violationsSummary, null, 2)}

CONTESTO GRUPPO SA:
${
  otherGroupProducts && otherGroupProducts.length > 0
    ? `Altre SA dello stesso gruppo presenti nel piano per questa unità produttiva:
${otherGroupProducts.map((p) => `- ${p.productName} (${p.activeIngredient}): ${p.activeTreatmentCount} trattamenti attivi`).join('\n')}
Totale trattamenti delle altre SA del gruppo: ${otherGroupProducts.reduce((s, p) => s + p.activeTreatmentCount, 0)}
IMPORTANTE: Il limite n_max_interventi_gruppo è CONDIVISO con queste SA! Devi sottrarre i loro trattamenti dal budget del gruppo.`
    : 'Nessuna altra SA dello stesso gruppo è presente nel piano per questa unità produttiva.'
}

REGOLE PER LA DECISIONE:
- n_max_interventi_sa = numero massimo di interventi per QUESTA singola sostanza attiva (o sottogruppo)
- n_max_interventi_gruppo = numero massimo di interventi CONDIVISI con le altre SA del gruppo
- Il limite effettivo per questa SA è: min(n_max_interventi_sa, n_max_interventi_gruppo - trattamenti_altre_SA_gruppo)
- Se n_max_interventi_sa è null, non c'è vincolo per singola SA
- Se n_max_interventi_gruppo è null, non c'è vincolo di gruppo
- Se entrambi sono null, tutti i trattamenti sono consentiti
- Mantieni i trattamenti nelle date agronomicamente più importanti (fasi critiche della coltura)
- Le violazioni rilevate dal sistema sono INDICATIVE: usa i vincoli strutturati del disciplinare come fonte autorevole

Rispondi con un JSON:
{{
  "max_trattamenti_consentiti": <numero massimo calcolato>,
  "indici_da_mantenere": [<indici 0-based dei trattamenti da tenere>],
  "motivazione": "<spiegazione della scelta>",
  "nota_per_agronomo": "<nota sintetica per l'utente>"
}}

Rispondi SOLO con il JSON, senza testo aggiuntivo.`;

  try {
    const { model: llm } = createChatModel({
      modelName: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 600,
    });
    const parser = new JsonOutputParser<TreatmentAdjustmentResult>();
    const chain = llm.pipe(parser);
    const result = await chain.invoke(prompt);

    // Validate indices: filter out any that are out of bounds
    const validIndices = (result.indici_da_mantenere || []).filter(
      (i) => Number.isInteger(i) && i >= 0 && i < trattamenti.length,
    );
    if (validIndices.length !== (result.indici_da_mantenere || []).length) {
      console.warn(
        `[RULES-COMPLIANCE] LLM returned invalid treatment indices for ${productName}. ` +
          `Valid range: 0-${trattamenti.length - 1}, got: ${JSON.stringify(result.indici_da_mantenere)}. ` +
          `Using only valid indices: ${JSON.stringify(validIndices)}`,
      );
    }
    const keepIndices = new Set(validIndices);

    const rawMaxAllowed = Number(result.max_trattamenti_consentiti);
    const maxAllowed =
      Number.isInteger(rawMaxAllowed) && rawMaxAllowed >= 0 ? rawMaxAllowed : trattamenti.length;

    console.log(
      `[RULES-COMPLIANCE] LLM adjustment for ${productName}: keep ${keepIndices.size}/${trattamenti.length} treatments (limit: ${maxAllowed}). ${result.motivazione}`,
    );

    const summary = {
      motivazione: result.motivazione ?? '',
      notaPerAgronomo: result.nota_per_agronomo ?? '',
    };

    if (keepIndices.size === trattamenti.length) {
      // LLM says all treatments are fine — just add informational note
      const infoNote = `[DISCIPLINARE] ${result.nota_per_agronomo || result.motivazione}`;
      const trattamentiOut = trattamenti.map((t) => ({
        ...t,
        note: [t.note, infoNote].filter(Boolean).join('\n'),
      }));
      return { trattamenti: trattamentiOut, summary };
    }

    const adjustmentNote = `[ADEGUAMENTO DISCIPLINARE] ${result.motivazione}`;
    const noteText = formatViolationsAsNote(violations);

    const trattamentiOut = trattamenti.map((t, index) => {
      const existingNote = t.note;
      if (keepIndices.has(index)) {
        return {
          ...t,
          note: [existingNote, adjustmentNote].filter(Boolean).join('\n'),
        };
      }
      const excessNote = `[ESCLUSO DA DISCIPLINARE] ${result.nota_per_agronomo || 'Trattamento in eccesso rimosso per conformità al disciplinare.'}\n${noteText}`;
      return {
        ...t,
        dose: 0,
        note: [existingNote, excessNote].filter(Boolean).join('\n'),
      };
    });
    return { trattamenti: trattamentiOut, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[RULES-COMPLIANCE] LLM adjustment failed for ${productName}: ${msg}`);
    // Fallback: keep all treatments with violation notes (don't zero without reliable data)
    const noteText = formatViolationsAsNote(violations);
    const trattamentiOut = trattamenti.map((t) => ({
      ...t,
      note: [t.note, `[VIOLAZIONE NON RISOLTA] ${noteText}`].filter(Boolean).join('\n'),
    }));
    return { trattamenti: trattamentiOut };
  }
}

/**
 * Extracts structured disciplinare info for each unique active ingredient via LLM.
 * Only processes rules with DISCIPLINARE category.
 */
async function extractDisciplinareInfo(params: {
  input: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  vectorizedRules: ReadonlyArray<{
    id: string;
    name: string;
    category: string;
    pdfFileUrl: string | null;
    workspaceId: string;
  }>;
  ragService: RulesRagService;
  companyId: string;
  workspaceId: string;
  context?: DosageAgentContext;
  resolvedCropNames: Map<string, string>;
}): Promise<Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>> {
  const { input, vectorizedRules, ragService, companyId, workspaceId, context, resolvedCropNames } =
    params;
  const resultMap = new Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>();

  const disciplinareRules = vectorizedRules.filter((r) => r.category === 'DISCIPLINARE');
  if (disciplinareRules.length === 0) {
    console.log('[RULES-COMPLIANCE] No DISCIPLINARE rules found, skipping info extraction');
    return resultMap;
  }

  // Collect unique active ingredient + crop combinations across all products.
  const extractionTargets = new Map<
    string,
    { activeIngredient: string; cropName: string; rawCropKey: string }
  >();
  for (const unit of input) {
    const unitCropName = unit.cropName ?? 'unknown';
    const resolvedCropName = resolvedCropNames.get(unitCropName) ?? unitCropName;
    for (const product of unit.products) {
      const ai = extractActiveIngredient(product);
      if (ai) {
        const targetKey = buildDisciplinareInfoKey(ai, resolvedCropName);
        if (!extractionTargets.has(targetKey)) {
          extractionTargets.set(targetKey, {
            activeIngredient: ai,
            cropName: resolvedCropName,
            rawCropKey: buildDisciplinareInfoKey(ai, unitCropName),
          });
        }
      }
    }
  }

  if (extractionTargets.size === 0) {
    console.log(
      '[RULES-COMPLIANCE] No active ingredient/crop combinations found in products, skipping info extraction',
    );
    return resultMap;
  }

  console.log(
    `[RULES-COMPLIANCE] Extracting disciplinare info for ${extractionTargets.size} active ingredient/crop combinations`,
  );

  const extractor = new DisciplinareInfoExtractor();

  // Process with controlled concurrency (max 3 parallel)
  const extractionEntries = Array.from(extractionTargets.entries());
  const concurrency = Math.min(3, extractionEntries.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < extractionEntries.length) {
      const index = currentIndex++;
      const [targetKey, target] = extractionEntries[index];
      const { activeIngredient, cropName, rawCropKey } = target;
      const infos: DisciplinareActiveIngredientInfo[] = [];

      for (const rule of disciplinareRules) {
        try {
          // Query 1: with resolved crop name for targeted results
          const results = await ragService.queryRulesForCompliance({
            companyId,
            workspaceId,
            query: `${activeIngredient} ${cropName} interventi massimo avversità limitazioni uso note`,
            categories: ['DISCIPLINARE'],
            k: 5,
          });

          let ruleResult = results.find((r) => r.ruleId === rule.id);

          // Query 2 (fallback): without crop name for broader results
          if (!ruleResult || ruleResult.relevantChunks.length === 0) {
            console.log(
              `[RULES-COMPLIANCE] No results for "${activeIngredient}" + "${cropName}", trying broader query`,
            );
            const broaderResults = await ragService.queryRulesForCompliance({
              companyId,
              workspaceId,
              query: `${activeIngredient} interventi massimo avversità limitazioni uso note sostanza attiva`,
              categories: ['DISCIPLINARE'],
              k: 8,
            });
            ruleResult = broaderResults.find((r) => r.ruleId === rule.id);
          }

          if (ruleResult && ruleResult.relevantChunks.length > 0) {
            console.log(
              `[RULES-COMPLIANCE] Found ${ruleResult.relevantChunks.length} chunks for "${activeIngredient}" in rule "${rule.name}"`,
            );
            const info = await extractor.extractForActiveIngredient({
              activeIngredient,
              cropName,
              chunks: ruleResult.relevantChunks,
              ruleId: rule.id,
              ruleName: rule.name,
              pdfFileUrl: rule.pdfFileUrl,
              context: context
                ? {
                    userId: context.userId,
                    companyId: context.companyId,
                    jobId: context.jobId,
                  }
                : undefined,
            });
            if (info) {
              console.log(
                `[RULES-COMPLIANCE] Extracted info for "${activeIngredient}": ` +
                  `avversita=${info.avversita.length}, grupo=${info.gruppo_sostanze_attive.length}`,
              );
              infos.push(info);
            } else {
              console.log(
                `[RULES-COMPLIANCE] LLM returned null for "${activeIngredient}" in rule "${rule.name}"`,
              );
            }
          } else {
            console.log(
              `[RULES-COMPLIANCE] No relevant chunks found for "${activeIngredient}" in rule "${rule.name}"`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[RULES-COMPLIANCE] Disciplinare info extraction failed for ${activeIngredient}: ${msg}`,
          );
        }
      }

      if (infos.length > 0) {
        resultMap.set(targetKey, infos);
        if (rawCropKey !== targetKey) {
          resultMap.set(rawCropKey, infos);
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(
    `[RULES-COMPLIANCE] Disciplinare info extracted for ${extractionEntries.length} active ingredient/crop combinations`,
  );

  return resultMap;
}

// extractProductName and extractActiveIngredient are imported from shared productAccessors

/**
 * Formats a list of violations as a human-readable note string.
 */
function formatViolationsAsNote(violations: ReadonlyArray<RuleViolationDetail>): string {
  return violations
    .map(
      (v) =>
        `[RULE-${v.severity}] ${v.ruleName} (${v.ruleCategory}): ${v.description}` +
        (v.suggestedAction ? ` | Azione: ${v.suggestedAction}` : ''),
    )
    .join('\n');
}

/**
 * Deduplicates violations by ruleId + violationType + description.
 */
function deduplicateViolations(
  violations: ReadonlyArray<RuleViolationDetail>,
): RuleViolationDetail[] {
  const seen = new Set<string>();
  return violations.filter((v) => {
    const key = `${v.ruleId}|${v.violationType}|${v.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// resolveCropNamesForDisciplinare is now in shared/cropNameResolver.ts
