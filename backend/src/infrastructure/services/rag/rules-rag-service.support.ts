import { RuleCategory } from '@prisma/client';
import { RuleComplianceResult } from '../../../domain/dtos/rule-rag.types';


/**
 * Parameters for validating product compliance against vectorized rules.
 */
export interface ValidateProductParams {
  readonly companyId: string;
  readonly workspaceId: string;
  readonly productName: string;
  readonly activeIngredient: string;
  readonly dose: number;
  readonly doseUnit: string;
  readonly applicationDate: Date;
  readonly cropName: string;
  readonly maxApplications?: number;
}


/**
 * Parameters for querying rules for compliance information.
 */
export interface QueryRulesParams {
  readonly companyId: string;
  readonly workspaceId: string;
  readonly query: string;
  readonly categories?: ReadonlyArray<RuleCategory>;
  readonly k?: number;
}


/**
 * Parameters for querying rules with flexible context (company and/or workspace).
 */
export interface QueryRulesWithContextParams {
  readonly workspaceId: string;
  readonly companyId?: string;
  readonly query: string;
  readonly categories?: ReadonlyArray<RuleCategory>;
  readonly k?: number;
  readonly includeWorkspaceRules?: boolean;
}


/**
 * Compliance result tagged with its source (company-assigned vs workspace).
 */
export interface RuleComplianceResultWithSource extends RuleComplianceResult {
  readonly source: 'company' | 'workspace';
  readonly isPublic: boolean;
}


/**
 * Reads the page number from a Qdrant document metadata payload.
 * Returns undefined when the parser did not propagate page info.
 */
export function extractPageFromMetadata(
  metadata: Record<string, unknown> | undefined,
): number | undefined {
  if (!metadata) return undefined;
  const candidates = [metadata.page, metadata.pageNumber];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return undefined;
}
