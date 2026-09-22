import { SkillMarketplaceFiltersDTO, SkillMarketplacePageDTO } from '../dtos/skill.dto';

export interface ISkillMarketplaceRepository {
  findMarketplaceSkills(filters: SkillMarketplaceFiltersDTO): Promise<SkillMarketplacePageDTO>;
}
