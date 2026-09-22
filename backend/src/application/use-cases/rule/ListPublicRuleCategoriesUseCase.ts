import { PublicRuleCategoryFacetDTO } from '../../../domain/dtos/public-rule.dto';
import { IPublicRuleRepository } from '../../../domain/repositories/IPublicRuleRepository';

export class ListPublicRuleCategoriesUseCase {
  constructor(private readonly publicRuleRepository: IPublicRuleRepository) {}

  async execute(): Promise<PublicRuleCategoryFacetDTO[]> {
    return this.publicRuleRepository.findCategoryFacets();
  }
}
