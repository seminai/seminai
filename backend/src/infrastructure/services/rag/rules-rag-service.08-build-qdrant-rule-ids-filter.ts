import { QdrantSearchFilter } from '../tool/vectorSearchQdrant';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceBuildQdrantRuleIdsFilter(this: RulesRagServiceContext, ruleIds: string[]): QdrantSearchFilter {
    const mustConditions: QdrantSearchFilter['must'] = [
      { key: 'metadata.sourceType', match: { value: 'rule_pdf' } },
    ];
    if (ruleIds.length === 1) {
      mustConditions.push({ key: 'metadata.ruleId', match: { value: ruleIds[0] } });
      return { must: mustConditions };
    }
    const shouldConditions = ruleIds.map((ruleId) => ({
      key: 'metadata.ruleId',
      match: { value: ruleId },
    }));
    return { must: mustConditions, should: shouldConditions };
  }
