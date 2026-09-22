import { Rule } from '../../../domain/entities/Rule';
import { QueryRulesWithContextParams, RuleComplianceResultWithSource, extractPageFromMetadata } from './rules-rag-service.support';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export async function rulesRagServiceQueryRulesWithContext(this: RulesRagServiceContext, params: QueryRulesWithContextParams): Promise<RuleComplianceResultWithSource[]> {
    const { workspaceId, companyId, query, categories, k = 10, includeWorkspaceRules } = params;

    // Collect all rules and track which ones are company-assigned
    const companyRuleIds = new Set<string>();
    let allRules: Rule[];

    if (companyId) {
      // Fetch company-assigned rules
      const companyRules = await this.getVectorizedRulesForCompany(companyId, categories);
      for (const r of companyRules) companyRuleIds.add(r.id);

      // Merge, deduplicating by ID (company rules already included in workspace set)
      const ruleMap = new Map<string, Rule>();
      for (const r of companyRules) ruleMap.set(r.id, r);
      if (includeWorkspaceRules === true) {
        const workspaceRules = await this.getVectorizedRulesForWorkspace(workspaceId, categories);
        for (const r of workspaceRules) {
          if (!ruleMap.has(r.id)) ruleMap.set(r.id, r);
        }
      }
      allRules = Array.from(ruleMap.values());
    } else {
      allRules = await this.getVectorizedRulesForWorkspace(workspaceId, categories);
    }

    if (allRules.length === 0) return [];

    const ruleIds = allRules.map((r) => r.id);
    const filter = companyId
      ? this.buildQdrantRuleIdsFilter(ruleIds)
      : this.buildQdrantFilter(workspaceId, ruleIds);
    const vectorService = this.getVectorService();
    const results = await vectorService.similaritySearchWithScore(query, k, filter);

    const ruleResultsMap = new Map<string, RuleComplianceResultWithSource>();
    for (const [doc, score] of results) {
      const ruleId = doc.metadata?.ruleId as string;
      if (!ruleId) continue;
      const rule = allRules.find((r) => r.id === ruleId);
      if (!rule) continue;

      const source = companyRuleIds.has(ruleId) ? ('company' as const) : ('workspace' as const);
      const chunk = {
        content: doc.pageContent,
        chunkIndex: (doc.metadata?.chunkIndex as number) ?? 0,
        score,
        page: extractPageFromMetadata(doc.metadata),
      };

      const existing = ruleResultsMap.get(ruleId);
      if (existing) {
        (existing.relevantChunks as Array<typeof chunk>).push(chunk);
      } else {
        ruleResultsMap.set(ruleId, {
          ruleId,
          ruleName: rule.name,
          category: rule.category,
          score,
          relevantChunks: [chunk],
          isCompliant: true,
          violations: [],
          source,
          isPublic: rule.isPublic,
        });
      }
    }

    // Sort: company-assigned rules first, then by score
    return Array.from(ruleResultsMap.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source === 'company' ? -1 : 1;
      return b.score - a.score;
    });
  }
