import { LlmJobType } from '@prisma/client';
import type { DosageAgentContext } from '../../dosage_agent/context';
import { getWorkingMemory } from '../working-memory';

export type CompanyContextSource = 'context' | 'currentCompanyId' | 'inputUnits';

export type ResolvedCompanyContext =
  | {
      readonly kind: 'single';
      readonly companyId: string;
      readonly source: CompanyContextSource;
    }
  | {
      readonly kind: 'multiple';
      readonly companyIds: readonly string[];
    }
  | {
      readonly kind: 'none';
    };

interface ResolveCompanyContextParams {
  readonly threadId: string;
  readonly context?: DosageAgentContext;
}

interface SyntheticContextParams {
  readonly threadId: string;
  readonly companyId: string;
  readonly userId?: string;
  readonly context?: DosageAgentContext;
}

/**
 * Resolves the effective company for ReAct dosage tools from stable context,
 * current mention memory, then production units loaded in working memory.
 */
export function resolveCompanyContext(params: ResolveCompanyContextParams): ResolvedCompanyContext {
  if (isNonEmptyString(params.context?.companyId)) {
    return { kind: 'single', companyId: params.context.companyId, source: 'context' };
  }
  const memory = getWorkingMemory(params.threadId);
  if (isNonEmptyString(memory.currentCompanyId)) {
    return { kind: 'single', companyId: memory.currentCompanyId, source: 'currentCompanyId' };
  }
  const companyIds = collectCompanyIdsFromInputUnits(memory.inputUnits);
  if (companyIds.length === 1) {
    return { kind: 'single', companyId: companyIds[0], source: 'inputUnits' };
  }
  if (companyIds.length > 1) {
    return { kind: 'multiple', companyIds };
  }
  return { kind: 'none' };
}

/**
 * Builds a DosageAgentContext for legacy dosage flows once ReAct has resolved
 * the company from working memory.
 */
export function buildSyntheticDosageContext(
  params: SyntheticContextParams,
): DosageAgentContext | null {
  const resolvedUserId = params.context?.userId ?? params.userId;
  if (!isNonEmptyString(resolvedUserId)) return null;
  return {
    jobId: params.context?.jobId ?? `react-${params.threadId}`,
    userId: resolvedUserId,
    companyId: params.companyId,
    jobGroupId: params.context?.jobGroupId,
    jobType: params.context?.jobType ?? LlmJobType.DOSAGE,
  };
}

function collectCompanyIdsFromInputUnits(units: readonly unknown[] | undefined): string[] {
  if (!units) return [];
  const ids = units.flatMap((unit) => {
    if (!isRecord(unit)) return [];
    const directId = getStringProperty(unit, 'companyId');
    if (directId) return [directId];
    const company = unit.company;
    if (!isRecord(company)) return [];
    const nestedId = getStringProperty(company, 'id');
    return nestedId ? [nestedId] : [];
  });
  return [...new Set(ids)];
}

function getStringProperty(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return isNonEmptyString(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
