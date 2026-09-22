import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { RuleViolationDetail, DisciplinareActiveIngredientInfo } from '../../../../domain/dtos/rule-rag.types';
import type { AppliedRulePayload } from '../../../../domain/dtos/applied-rules.dto';

/**
 * Builds the lookup key used by appliedRulesByProduct.
 */
export function buildAppliedRulesKey(unitProductionId: string, productName: string): string {
  return `${unitProductionId}|${productName.trim().toLowerCase()}`;
}

/**
 * Result of the rules compliance validation flow.
 */
export interface RulesComplianceFlowResult {
  readonly output: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly violations: ReadonlyArray<RuleViolationDetail>;
  readonly disciplinareInfoMap: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>;
  readonly appliedRulesByProduct: Map<string, ReadonlyArray<AppliedRulePayload>>;
}

/**
 * LLM response for treatment adjustment.
 */
export interface TreatmentAdjustmentResult {
  max_trattamenti_consentiti: number;
  indici_da_mantenere: number[];
  motivazione: string;
  nota_per_agronomo: string;
}
