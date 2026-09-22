import { DosageAgentContext } from './context';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { RuleViolationDetail, ProductComplianceValidation, DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import type { AppliedRulePayload } from '../../../../domain/dtos/applied-rules.dto';
import { CompanyRulesService } from './companyRulesService';
import { RulesRagService } from '../../rag/RulesRagService';
import { resolveCropNamesForDisciplinare } from '../shared/cropNameResolver';
import { extractProductName, extractActiveIngredient, extractTreatments, getActiveTreatments, type TreatmentView, buildDisciplinareInfoKey } from './productAccessors';
import { RulesComplianceFlowResult, buildAppliedRulesKey } from './flowValidateRulesCompliance.part-01-build-applied-rules-key';
import { deduplicateViolations, extractDisciplinareInfo, formatViolationsAsNote } from './flowValidateRulesCompliance.part-05-extract-disciplinare-info';
import { adjustTreatmentsWithLlm } from './flowValidateRulesCompliance.part-04-adjust-treatments-with-llm';
import { buildAppliedRulesForProductInFlow } from './flowValidateRulesCompliance.part-03-build-applied-rules-for-product-in-flow';

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
