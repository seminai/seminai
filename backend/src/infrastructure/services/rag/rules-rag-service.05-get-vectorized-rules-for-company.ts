import { RuleCategory } from '@prisma/client';
import { Rule } from '../../../domain/entities/Rule';
import { VECTORIZABLE_RULE_CATEGORIES } from '../../../domain/dtos/rule-rag.types';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export async function rulesRagServiceGetVectorizedRulesForCompany(this: RulesRagServiceContext, companyId: string, categories?: ReadonlyArray<RuleCategory>): Promise<Rule[]> {
    const assignments = await this.ruleOnCompanyRepository.findActiveByCompanyId(companyId);
    if (assignments.length === 0) return [];
    const ruleIds = assignments.map((a) => a.ruleId);
    const vectorizedRules = await this.ruleRepository.findVectorizedByIds(ruleIds);
    // findVectorizedByIds does not filter by category, so apply it in memory
    const targetCategories = categories ?? VECTORIZABLE_RULE_CATEGORIES;
    return vectorizedRules.filter(
      (r) => targetCategories.includes(r.category) && r.isCurrentlyValid(),
    );
  }
