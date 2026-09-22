import { RuleCategory } from '@prisma/client';
import { PublicRuleFiltersDTO, PublicRuleListPageDTO } from '../../../domain/dtos/public-rule.dto';
import { IPublicRuleRepository } from '../../../domain/repositories/IPublicRuleRepository';

interface ListPublicRulesRequest {
  readonly filters: {
    readonly category?: RuleCategory;
    readonly region?: string;
    readonly search?: string;
    readonly page?: number;
    readonly limit?: number;
  };
}

export class ListPublicRulesUseCase {
  constructor(private readonly publicRuleRepository: IPublicRuleRepository) {}

  async execute(request: ListPublicRulesRequest): Promise<PublicRuleListPageDTO> {
    return this.publicRuleRepository.findPublicRules(this.normalizeFilters(request.filters));
  }

  private normalizeFilters(filters: ListPublicRulesRequest['filters']): PublicRuleFiltersDTO {
    return {
      category: filters.category,
      region: this.clean(filters.region),
      search: this.clean(filters.search),
      page: this.positiveInteger(filters.page, 1),
      limit: this.positiveInteger(filters.limit, 20),
    };
  }

  private clean(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    if (!value || !Number.isFinite(value) || value < 1) return fallback;
    return Math.floor(value);
  }
}
