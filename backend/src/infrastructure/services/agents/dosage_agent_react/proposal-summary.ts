import { getWorkingMemory } from './working-memory';
import type { UnitAllowedProductsWithDosageOutput } from '../dosage_agent/flowMatchProductionUnitTreatmentDosage';

/**
 * Per-product summary inside a proposal.
 * Treatments are counted, not enumerated — agents needing the full plan can
 * inspect the underlying job list after approval.
 */
export interface ProposalProductSummary {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly treatmentCount: number;
}

/**
 * Per-unit summary inside a proposal.
 */
export interface ProposalUnitSummary {
  readonly productionUnitId: string;
  readonly cropName?: string;
  readonly variety?: string;
  readonly areaHa?: number;
  readonly jobCount: number;
  readonly products: ReadonlyArray<ProposalProductSummary>;
}

/**
 * Structured summary of what would be created by `create_treatment_jobs`,
 * computed without persisting. Exposed alongside REQUIRES_APPROVAL responses
 * so external agents (MCP, API consumers) can render a deterministic preview
 * without parsing the free-text agent message.
 */
export interface ProposalSummary {
  readonly tool: 'create_treatment_jobs';
  readonly totalJobs: number;
  readonly unitsCount: number;
  readonly units: ReadonlyArray<ProposalUnitSummary>;
  readonly complianceViolationsCount: number;
  readonly hasComplianceViolations: boolean;
}

const SUPPORTED_TOOLS = new Set<string>(['create_treatment_jobs']);

function buildUnitSummary(unit: UnitAllowedProductsWithDosageOutput): ProposalUnitSummary {
  const products: ProposalProductSummary[] = [];
  let jobCount = 0;
  for (const product of unit.products ?? []) {
    const treatmentCount = product.trattamenti?.length ?? 0;
    if (treatmentCount === 0) continue;
    jobCount += treatmentCount;
    products.push({
      productName: product.name,
      registrationNumber: product.regNumber,
      treatmentCount,
    });
  }
  return {
    productionUnitId: unit.unitProductionId,
    cropName: unit.cropName,
    variety: unit.variety,
    areaHa: unit.areaHa,
    jobCount,
    products,
  };
}

/**
 * Builds a structured proposal summary for a pending tool call.
 * Returns undefined when the tool is not summarisable or the working memory
 * does not yet contain the required precomputed data.
 */
export function buildProposalSummary(
  threadId: string,
  toolName: string,
): ProposalSummary | undefined {
  if (!SUPPORTED_TOOLS.has(toolName)) return undefined;

  const wm = getWorkingMemory(threadId);
  const dosageResults = wm.dosageResults;
  if (!dosageResults || dosageResults.length === 0) return undefined;

  const units = dosageResults.map(buildUnitSummary).filter((unit) => unit.jobCount > 0);
  if (units.length === 0) return undefined;

  const totalJobs = units.reduce((acc, unit) => acc + unit.jobCount, 0);
  const violations = wm.complianceResult?.violations ?? [];

  return {
    tool: 'create_treatment_jobs',
    totalJobs,
    unitsCount: units.length,
    units,
    complianceViolationsCount: violations.length,
    hasComplianceViolations: violations.length > 0,
  };
}
