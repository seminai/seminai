import { RuleCategory, RuleStatus, Prisma } from '@prisma/client';

export interface CreateRuleDTO {
  workspaceId: string;
  name: string;
  slug?: string;
  description?: string | null;
  category: RuleCategory;
  content: Prisma.JsonValue;
  sourceUrl?: string | null;
  sourceDocument?: string | null;
  region?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  version?: string | null;
  isPublic?: boolean;
  isTemplate?: boolean;
  createdById: string;
  pdfFileUrl?: string | null;
  pdfFileName?: string | null;
  pdfFileHash?: string | null;
}

export interface UpdateRuleDTO {
  name?: string;
  slug?: string;
  description?: string | null;
  category?: RuleCategory;
  status?: RuleStatus;
  content?: Prisma.JsonValue;
  sourceUrl?: string | null;
  sourceDocument?: string | null;
  region?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  version?: string | null;
  isPublic?: boolean;
  isTemplate?: boolean;
  pdfFileUrl?: string | null;
  pdfFileName?: string | null;
  pdfFileHash?: string | null;
  isVectorized?: boolean;
  vectorizedAt?: Date | null;
  vectorizationError?: string | null;
}

export interface AssignRuleToCompanyDTO {
  ruleId: string;
  companyId: string;
  workspaceId?: string;
  priority?: number;
  overrides?: Prisma.JsonValue | null;
  notes?: string | null;
  assignedById: string;
}

export interface UpdateRuleAssignmentDTO {
  isActive?: boolean;
  priority?: number;
  overrides?: Prisma.JsonValue | null;
  notes?: string | null;
}

export interface RuleApplicabilityDiagnosticsDTO {
  appliesToDosage: boolean;
  appliesToCompliance: boolean;
  warnings: readonly string[];
  notApplicableReason: string | null;
}

export interface AddRuleToCropDTO {
  ruleId: string;
  cropName: string;
  cropType?: string | null;
  parameters?: Prisma.JsonValue | null;
}

export interface RuleWithAssignmentsDTO {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  category: RuleCategory;
  status: RuleStatus;
  content: Prisma.JsonValue;
  sourceUrl: string | null;
  sourceDocument: string | null;
  region: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  version: string | null;
  isPublic: boolean;
  isTemplate: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  pdfFileUrl: string | null;
  pdfFileName: string | null;
  isVectorized: boolean;
  vectorizedAt: Date | null;
  vectorizationError: string | null;
  companiesCount: number;
  cropsCount: number;
  companies: Array<{
    id: string;
    name: string;
  }>;
}

export interface RuleListFiltersDTO {
  workspaceId?: string;
  category?: RuleCategory;
  status?: RuleStatus;
  region?: string;
  isPublic?: boolean;
  isTemplate?: boolean;
  search?: string;
}

export interface RuleMarketplaceFiltersDTO {
  category?: RuleCategory;
  region?: string;
  creator?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface RuleMarketplaceItemDTO {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  category: RuleCategory;
  status: RuleStatus;
  sourceUrl: string | null;
  sourceDocument: string | null;
  region: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  version: string | null;
  isPublic: boolean;
  isTemplate: boolean;
  isFeatured: boolean;
  viewCount: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  pdfFileUrl: string | null;
  pdfFileName: string | null;
  isVectorized: boolean;
  vectorizedAt: Date | null;
  vectorizationError: string | null;
  assignmentsCount: number;
  creator: {
    id: string;
    name: string;
    email: string;
  };
}

export interface RuleMarketplacePageDTO {
  items: RuleMarketplaceItemDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}
