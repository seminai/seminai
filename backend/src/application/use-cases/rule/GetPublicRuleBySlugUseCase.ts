import { PublicRuleDetailDTO } from '../../../domain/dtos/public-rule.dto';
import { AppError } from '../../../domain/errors/AppError';
import { IPublicRuleRepository } from '../../../domain/repositories/IPublicRuleRepository';

export class GetPublicRuleBySlugUseCase {
  constructor(private readonly publicRuleRepository: IPublicRuleRepository) {}

  async execute(slug: string): Promise<PublicRuleDetailDTO> {
    const rule = await this.publicRuleRepository.findPublicRuleBySlug(slug);
    if (!rule) {
      throw AppError.notFound('Public rule not found', 'PUBLIC_RULE_NOT_FOUND');
    }
    void this.publicRuleRepository.incrementViewCount(rule.id);
    return rule;
  }
}
