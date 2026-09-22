import { RuleCategory } from '@prisma/client';
import { RulesRagService } from '../../../rag/RulesRagService';
import { resolveJobCompanyContext } from './job-company-resolver';
import type { CompanyRuleSearchResult } from '../types';
import { prisma } from '../../../../repositories/Prisma';

interface SearchRulesParams {
  readonly query: string;
  readonly categories?: ReadonlyArray<RuleCategory>;
  readonly k?: number;
  // Context resolution (priority order)
  readonly jobId?: string;
  readonly workspaceId?: string;
  readonly userId?: string;
  readonly companyId?: string;
  readonly includeWorkspaceExploratory?: boolean;
}

interface SearchContext {
  readonly workspaceId: string;
  readonly companyId?: string;
}

/**
 * Resolves search context using a priority-based strategy:
 * 1. Direct companyId → use it with workspaceId
 * 2. jobId → derive company + workspace from job
 * 3. workspaceId only → workspace-level search
 * 4. userId only → derive workspace from user memberships
 */
async function resolveSearchContext(
  params: Pick<SearchRulesParams, 'jobId' | 'workspaceId' | 'userId' | 'companyId'>,
): Promise<SearchContext | null> {
  if (params.companyId && params.userId) {
    const canAccessCompany = await hasCompanyAccess(params.userId, params.companyId);
    if (!canAccessCompany) return null;
  }

  // Priority 1: direct companyId from the agent (when working on a known company)
  if (params.companyId && params.workspaceId) {
    return { workspaceId: params.workspaceId, companyId: params.companyId };
  }

  // Priority 2: jobId → resolve company + workspace from job
  if (params.jobId) {
    const jobContext = await resolveJobCompanyContext({
      jobId: params.jobId,
      userId: params.userId,
    });
    if (jobContext) {
      if (params.userId) {
        const canAccessCompany = await hasCompanyAccess(params.userId, jobContext.companyId);
        if (!canAccessCompany) return null;
      }
      const workspaceId = jobContext.workspaceIds[0] ?? params.workspaceId;
      if (workspaceId) {
        return { workspaceId, companyId: jobContext.companyId };
      }
    }
  }

  // Priority 3: direct companyId without workspaceId — try to derive workspace
  if (params.companyId && params.userId) {
    const workspaceId = await resolveWorkspaceIdForCompanyRules({
      userId: params.userId,
      companyId: params.companyId,
    });
    if (workspaceId) {
      return { workspaceId, companyId: params.companyId };
    }
  }

  // Priority 4: direct workspaceId (no company context)
  if (params.workspaceId) {
    return { workspaceId: params.workspaceId };
  }

  // Priority 5: derive from userId's workspace memberships
  if (params.userId) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: params.userId },
      select: { workspaceId: true },
      take: 1,
    });
    if (memberships.length > 0) {
      return { workspaceId: memberships[0].workspaceId };
    }
  }

  return null;
}

/**
 * Searches vectorized rules using flexible context resolution.
 * Supports job-based (company + workspace), workspace-only, and user-fallback scenarios.
 */
export async function searchRules(params: SearchRulesParams): Promise<CompanyRuleSearchResult[]> {
  const context = await resolveSearchContext({
    jobId: params.jobId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    companyId: params.companyId,
  });
  if (!context) {
    return [];
  }

  const ragService = new RulesRagService();
  const results = await ragService.queryRulesWithContext({
    workspaceId: context.workspaceId,
    companyId: context.companyId,
    query: params.query,
    categories: params.categories,
    k: params.k ?? 5,
    includeWorkspaceRules: params.includeWorkspaceExploratory === true,
  });

  return results.map((result) => ({
    ruleId: result.ruleId,
    ruleName: result.ruleName,
    ruleCategory: result.category,
    source: result.source,
    isPublic: result.isPublic,
    score: result.score,
    chunks: result.relevantChunks.map((chunk) => ({
      content: chunk.content,
      score: chunk.score,
      chunkIndex: chunk.chunkIndex,
    })),
  }));
}

async function hasCompanyAccess(userId: string, companyId: string): Promise<boolean> {
  const row = await prisma.company.findFirst({
    where: { id: companyId, companyUsers: { some: { userId } } },
    select: { id: true },
  });
  return row !== null;
}

async function resolveWorkspaceIdForCompanyRules(params: {
  readonly userId: string;
  readonly companyId: string;
}): Promise<string | null> {
  const assignedRule = await prisma.ruleOnCompany.findFirst({
    where: {
      companyId: params.companyId,
      rule: { workspace: { members: { some: { userId: params.userId } } } },
    },
    select: { rule: { select: { workspaceId: true } } },
    orderBy: [{ priority: 'asc' }, { assignedAt: 'desc' }],
  });
  if (assignedRule) return assignedRule.rule.workspaceId;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: params.userId },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}
