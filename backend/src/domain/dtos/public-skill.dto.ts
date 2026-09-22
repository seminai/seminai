export interface PublicSkillFiltersDTO {
  search?: string;
  page: number;
  limit: number;
}

export interface PublicSkillListItemDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sourceRuleSlug: string | null;
  sourceRuleName: string | null;
  isFeatured: boolean;
  viewCount: number;
  creatorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicSkillDetailDTO extends PublicSkillListItemDTO {
  instructions: string;
}

export interface PublicSkillListPageDTO {
  items: PublicSkillListItemDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}
