import { RuleComplianceResult } from '../../../domain/dtos/rule-rag.types';
import { QueryRulesParams, extractPageFromMetadata } from './rules-rag-service.support';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export async function rulesRagServiceQueryRulesForCompliance(this: RulesRagServiceContext, params: QueryRulesParams): Promise<RuleComplianceResult[]> {
    const { companyId, workspaceId, query, categories, k = 10 } = params;
    const vectorizedRules = await this.getVectorizedRulesForCompany(companyId, categories);
    if (vectorizedRules.length === 0) return [];
    const ruleIds = vectorizedRules.map((r) => r.id);
    const filter = this.buildQdrantFilter(workspaceId, ruleIds);
    const vectorService = this.getVectorService();
    const results = await vectorService.similaritySearchWithScore(query, k, filter);
    const ruleResultsMap = new Map<string, RuleComplianceResult>();
    for (const [doc, score] of results) {
      const ruleId = doc.metadata?.ruleId as string;
      if (!ruleId) continue;
      const rule = vectorizedRules.find((r) => r.id === ruleId);
      if (!rule) continue;
      const existing = ruleResultsMap.get(ruleId);
      const chunk = {
        content: doc.pageContent,
        chunkIndex: (doc.metadata?.chunkIndex as number) ?? 0,
        score,
        page: extractPageFromMetadata(doc.metadata),
      };
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
        });
      }
    }
    return Array.from(ruleResultsMap.values());
  }
