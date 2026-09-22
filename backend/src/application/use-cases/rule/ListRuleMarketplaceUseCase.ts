import { RuleCategory } from '@prisma/client';
import { RuleMarketplaceFiltersDTO, RuleMarketplacePageDTO } from '../../../domain/dtos/rule.dto';
import { IRuleMarketplaceRepository } from '../../../domain/repositories/IRuleMarketplaceRepository';

interface ListRuleMarketplaceRequest {
  readonly filters: {
    readonly category?: RuleCategory;
    readonly region?: string;
    readonly creator?: string;
    readonly search?: string;
    readonly page?: number;
    readonly limit?: number;
  };
}

export class ListRuleMarketplaceUseCase {
  constructor(private readonly marketplaceRepository: IRuleMarketplaceRepository) {}

  async execute(request: ListRuleMarketplaceRequest): Promise<RuleMarketplacePageDTO> {
    return this.marketplaceRepository.findMarketplaceRules(this.normalizeFilters(request.filters));
  }

  private normalizeFilters(
    filters: ListRuleMarketplaceRequest['filters'],
  ): RuleMarketplaceFiltersDTO {
    return {
      category: filters.category,
      region: this.clean(filters.region),
      creator: this.clean(filters.creator),
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
