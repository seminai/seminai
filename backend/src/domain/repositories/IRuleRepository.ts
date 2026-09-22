import { RuleCategory } from '@prisma/client';
import { Rule } from '../entities/Rule';
import { RuleListFiltersDTO, RuleWithAssignmentsDTO } from '../dtos/rule.dto';

export interface IRuleRepository {
  create(rule: Rule): Promise<Rule>;
  findById(id: string): Promise<Rule | null>;
  findBySlug(workspaceId: string, slug: string): Promise<Rule | null>;
  findByWorkspaceId(workspaceId: string): Promise<Rule[]>;
  findWithFilters(filters: RuleListFiltersDTO): Promise<Rule[]>;
  findWithFiltersAndCounts(filters: RuleListFiltersDTO): Promise<RuleWithAssignmentsDTO[]>;
  findWithCounts(id: string): Promise<RuleWithAssignmentsDTO | null>;
  findPublicRules(): Promise<Rule[]>;
  findTemplates(): Promise<Rule[]>;
  update(id: string, data: Partial<Rule>): Promise<Rule>;
  delete(id: string): Promise<void>;
  countByWorkspaceId(workspaceId: string): Promise<number>;
  findVectorizedByIds(ruleIds: string[]): Promise<Rule[]>;
  findVectorizedByWorkspaceId(
    workspaceId: string,
    categories?: ReadonlyArray<RuleCategory>,
  ): Promise<Rule[]>;
}
