import { RuleCategory } from '@prisma/client';

export interface PublicRuleFiltersDTO {
  category?: RuleCategory;
  region?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface PublicRuleListItemDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: RuleCategory;
  region: string | null;
  version: string | null;
  isFeatured: boolean;
  viewCount: number;
  assignmentsCount: number;
  creatorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicRuleListPageDTO {
  items: PublicRuleListItemDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export interface PublicRuleDetailDTO extends PublicRuleListItemDTO {
  sourceUrl: string | null;
  sourceDocument: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  isTemplate: boolean;
}

export interface PublicRuleCategoryFacetDTO {
  category: RuleCategory;
  count: number;
}
