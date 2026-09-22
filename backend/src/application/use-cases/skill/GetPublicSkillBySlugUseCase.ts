import { PublicSkillDetailDTO } from '../../../domain/dtos/public-skill.dto';
import { AppError } from '../../../domain/errors/AppError';
import { IPublicSkillRepository } from '../../../domain/repositories/IPublicSkillRepository';

export class GetPublicSkillBySlugUseCase {
  constructor(private readonly publicSkillRepository: IPublicSkillRepository) {}

  async execute(slug: string): Promise<PublicSkillDetailDTO> {
    const skill = await this.publicSkillRepository.findPublicSkillBySlug(slug);
    if (!skill) {
      throw AppError.notFound('Public skill not found', 'PUBLIC_SKILL_NOT_FOUND');
    }
    void this.publicSkillRepository.incrementViewCount(skill.id);
    return skill;
  }
}
