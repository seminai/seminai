import { RuleCategory } from '@prisma/client';
import { Rule } from '../../../domain/entities/Rule';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export async function rulesRagServiceGetVectorizedRulesForWorkspace(this: RulesRagServiceContext, workspaceId: string, categories?: ReadonlyArray<RuleCategory>): Promise<Rule[]> {
    const rules = await this.ruleRepository.findVectorizedByWorkspaceId(workspaceId, categories);
    return rules.filter((r) => r.isCurrentlyValid());
  }
