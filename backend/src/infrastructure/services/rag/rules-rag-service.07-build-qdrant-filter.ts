import { QdrantSearchFilter } from '../tool/vectorSearchQdrant';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceBuildQdrantFilter(this: RulesRagServiceContext, workspaceId: string, ruleIds: string[]): QdrantSearchFilter {
    // Build must conditions with workspace and sourceType
    // Note: LangChain uses "metadata" as the payload key for document metadata
    const mustConditions: QdrantSearchFilter['must'] = [
      { key: 'metadata.workspaceId', match: { value: workspaceId } },
      { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
    ];

    // If there's only one ruleId, add it to must for simpler filtering
    // If there are multiple ruleIds, use should for OR logic
    if (ruleIds.length === 1) {
      mustConditions.push({ key: 'metadata.ruleId', match: { value: ruleIds[0] } });
      return { must: mustConditions };
    }

    // For multiple rules, use should conditions (at least one must match)
    const shouldConditions = ruleIds.map((ruleId) => ({
      key: 'metadata.ruleId',
      match: { value: ruleId },
    }));
    return {
      must: mustConditions,
      should: shouldConditions,
    };
  }
