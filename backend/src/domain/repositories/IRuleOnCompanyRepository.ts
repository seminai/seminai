import { RuleOnCompany } from '../entities/RuleOnCompany';
import { WorkspaceKind } from '@prisma/client';

export interface IRuleOnCompanyRepository {
  create(ruleOnCompany: RuleOnCompany): Promise<RuleOnCompany>;
  findById(id: string): Promise<RuleOnCompany | null>;
  findByRuleAndCompany(ruleId: string, companyId: string): Promise<RuleOnCompany | null>;
  findByRuleId(ruleId: string): Promise<RuleOnCompany[]>;
  findByCompanyId(companyId: string): Promise<RuleOnCompany[]>;
  findActiveByCompanyId(companyId: string): Promise<RuleOnCompany[]>;
  update(id: string, data: Partial<RuleOnCompany>): Promise<RuleOnCompany>;
  delete(id: string): Promise<void>;
  deleteByRuleAndCompany(ruleId: string, companyId: string): Promise<void>;
  findDistinctWorkspaceKindsByCompanyId(companyId: string): Promise<WorkspaceKind[]>;
}
