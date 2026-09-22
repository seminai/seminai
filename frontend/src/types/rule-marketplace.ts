import type { RuleCategory, RuleStatus } from "@/types/workspace";

export interface RuleMarketplaceCreator {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface RuleMarketplaceItem {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: RuleCategory;
  readonly status: RuleStatus;
  readonly sourceUrl: string | null;
  readonly sourceDocument: string | null;
  readonly region: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly version: string | null;
  readonly isVectorized: boolean;
  readonly vectorizationError: string | null;
  readonly isFeatured: boolean;
  readonly viewCount: number;
  readonly assignmentsCount: number;
  readonly creator: RuleMarketplaceCreator;
}

export interface RuleMarketplacePage {
  readonly items: readonly RuleMarketplaceItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly hasNextPage: boolean;
}
