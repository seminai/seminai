import {
  SkillMarketplaceFiltersDTO,
  SkillMarketplacePageDTO,
} from '../../../domain/dtos/skill.dto';
import { ISkillMarketplaceRepository } from '../../../domain/repositories/ISkillMarketplaceRepository';

interface ListSkillMarketplaceRequest {
  readonly filters: {
    readonly creator?: string;
    readonly search?: string;
    readonly page?: number;
    readonly limit?: number;
  };
}

export class ListSkillMarketplaceUseCase {
  constructor(private readonly marketplaceRepository: ISkillMarketplaceRepository) {}

  async execute(request: ListSkillMarketplaceRequest): Promise<SkillMarketplacePageDTO> {
    return this.marketplaceRepository.findMarketplaceSkills(this.normalizeFilters(request.filters));
  }

  private normalizeFilters(
    filters: ListSkillMarketplaceRequest['filters'],
  ): SkillMarketplaceFiltersDTO {
    return {
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
