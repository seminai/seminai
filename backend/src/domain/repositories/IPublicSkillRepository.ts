import {
  PublicSkillDetailDTO,
  PublicSkillFiltersDTO,
  PublicSkillListPageDTO,
} from '../dtos/public-skill.dto';

export interface IPublicSkillRepository {
  findPublicSkills(filters: PublicSkillFiltersDTO): Promise<PublicSkillListPageDTO>;
  findPublicSkillBySlug(slug: string): Promise<PublicSkillDetailDTO | null>;
  incrementViewCount(skillId: string): Promise<void>;
}
