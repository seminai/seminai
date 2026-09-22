export interface SkillMarketplaceCreator {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface SkillMarketplaceItem {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly instructions: string;
  readonly sourceRuleId: string | null;
  readonly sourceRuleName: string | null;
  readonly isFeatured: boolean;
  readonly viewCount: number;
  readonly creator: SkillMarketplaceCreator;
}

export interface SkillMarketplacePage {
  readonly items: readonly SkillMarketplaceItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasNextPage: boolean;
}
