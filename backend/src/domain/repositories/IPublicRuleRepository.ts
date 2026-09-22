import {
  PublicRuleCategoryFacetDTO,
  PublicRuleDetailDTO,
  PublicRuleFiltersDTO,
  PublicRuleListPageDTO,
} from '../dtos/public-rule.dto';

export interface IPublicRuleRepository {
  findPublicRules(filters: PublicRuleFiltersDTO): Promise<PublicRuleListPageDTO>;
  findPublicRuleBySlug(slug: string): Promise<PublicRuleDetailDTO | null>;
  findCategoryFacets(): Promise<PublicRuleCategoryFacetDTO[]>;
  incrementViewCount(ruleId: string): Promise<void>;
}
