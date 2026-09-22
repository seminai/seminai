import { SkillStatus } from '@prisma/client';

export interface CreateSkillDTO {
  workspaceId: string;
  name: string;
  slug?: string;
  description?: string | null;
  instructions: string;
  sourceRuleId?: string | null;
  isPublic?: boolean;
  createdById: string;
}

export interface UpdateSkillDTO {
  name?: string;
  slug?: string;
  description?: string | null;
  status?: SkillStatus;
  instructions?: string;
  sourceRuleId?: string | null;
  isPublic?: boolean;
}

export interface SkillListFiltersDTO {
  workspaceId?: string;
  status?: SkillStatus;
  isPublic?: boolean;
  search?: string;
}

export interface SkillMarketplaceFiltersDTO {
  search?: string;
  creator?: string;
  page: number;
  limit: number;
}

export interface SkillMarketplaceItemDTO {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  status: SkillStatus;
  instructions: string;
  sourceRuleId: string | null;
  sourceRuleName: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  viewCount: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    name: string;
    email: string;
  };
}

export interface SkillMarketplacePageDTO {
  items: SkillMarketplaceItemDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}
