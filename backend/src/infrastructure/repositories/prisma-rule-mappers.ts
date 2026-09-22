import { Prisma } from '@prisma/client';
import { RuleListFiltersDTO, RuleWithAssignmentsDTO } from '../../domain/dtos/rule.dto';

export const RULE_WITH_ASSIGNMENTS_INCLUDE = {
  _count: { select: { companyRules: true, cropRules: true } },
  companyRules: {
    include: { company: { select: { id: true, name: true } } },
    orderBy: { priority: 'asc' as const },
  },
} as const;

type RuleWithAssignmentsRecord = Prisma.RuleGetPayload<{
  include: typeof RULE_WITH_ASSIGNMENTS_INCLUDE;
}>;

export const buildRuleWhere = (filters: RuleListFiltersDTO): Prisma.RuleWhereInput => ({
  ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
  ...(filters.category ? { category: filters.category } : {}),
  ...(filters.status ? { status: filters.status } : {}),
  ...(filters.region ? { region: filters.region } : {}),
  ...(filters.isPublic !== undefined ? { isPublic: filters.isPublic } : {}),
  ...(filters.isTemplate !== undefined ? { isTemplate: filters.isTemplate } : {}),
  ...(filters.search
    ? {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' as const } },
          { description: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      }
    : {}),
});

export const toRuleWithAssignments = (
  rule: RuleWithAssignmentsRecord,
): RuleWithAssignmentsDTO => ({
  id: rule.id,
  workspaceId: rule.workspaceId,
  name: rule.name,
  slug: rule.slug,
  description: rule.description,
  category: rule.category,
  status: rule.status,
  content: rule.content,
  sourceUrl: rule.sourceUrl,
  sourceDocument: rule.sourceDocument,
  region: rule.region,
  validFrom: rule.validFrom,
  validUntil: rule.validUntil,
  version: rule.version,
  isPublic: rule.isPublic,
  isTemplate: rule.isTemplate,
  createdById: rule.createdById,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt,
  pdfFileUrl: rule.pdfFileUrl,
  pdfFileName: rule.pdfFileName,
  isVectorized: rule.isVectorized,
  vectorizedAt: rule.vectorizedAt,
  vectorizationError: rule.vectorizationError,
  companiesCount: rule._count.companyRules,
  cropsCount: rule._count.cropRules,
  companies: rule.companyRules.map(({ company }) => ({
    id: company.id,
    name: company.name,
  })),
});
