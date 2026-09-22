import {
  PublicSkillFiltersDTO,
  PublicSkillListPageDTO,
} from '../../../domain/dtos/public-skill.dto';
import { IPublicSkillRepository } from '../../../domain/repositories/IPublicSkillRepository';

interface ListPublicSkillsRequest {
  readonly filters: {
    readonly search?: string;
    readonly page?: number;
    readonly limit?: number;
  };
}

export class ListPublicSkillsUseCase {
  constructor(private readonly publicSkillRepository: IPublicSkillRepository) {}

  async execute(request: ListPublicSkillsRequest): Promise<PublicSkillListPageDTO> {
    return this.publicSkillRepository.findPublicSkills(this.normalizeFilters(request.filters));
  }

  private normalizeFilters(filters: ListPublicSkillsRequest['filters']): PublicSkillFiltersDTO {
    return {
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
