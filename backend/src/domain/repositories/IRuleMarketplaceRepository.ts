import { RuleMarketplaceFiltersDTO, RuleMarketplacePageDTO } from '../dtos/rule.dto';

export interface IRuleMarketplaceRepository {
  findMarketplaceRules(filters: RuleMarketplaceFiltersDTO): Promise<RuleMarketplacePageDTO>;
}
