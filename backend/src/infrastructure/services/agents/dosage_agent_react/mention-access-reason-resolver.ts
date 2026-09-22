import type { MentionEntityType } from '../../../../domain/dtos/mention.dto';
import { prisma } from '../../../repositories/Prisma';
import type { MentionResolutionReason } from './mention-context-resolver';

interface ResolveMentionAccessReasonParams {
  readonly type: MentionEntityType;
  readonly id: string;
  readonly userId: string;
}

/**
 * Distinguishes mention failures between:
 * - not_found: entity does not exist
 * - not_authorized: entity exists but is outside user scope
 */
export async function resolveMentionAccessReason(
  params: ResolveMentionAccessReasonParams,
): Promise<MentionResolutionReason> {
  const { type, id, userId } = params;
  if (type === 'company') {
    return resolveEntityAccessReason({
      existsQuery: () => prisma.company.findUnique({ where: { id }, select: { id: true } }),
      authorizedQuery: () =>
        prisma.company.findFirst({
          where: { id, companyUsers: { some: { userId } } },
          select: { id: true },
        }),
    });
  }
  if (type === 'product') {
    return resolveEntityAccessReason({
      existsQuery: () => prisma.product.findUnique({ where: { id }, select: { id: true } }),
      authorizedQuery: () =>
        prisma.product.findFirst({
          where: { id, warehouse: { company: { companyUsers: { some: { userId } } } } },
          select: { id: true },
        }),
    });
  }
  if (type === 'field') {
    return resolveEntityAccessReason({
      existsQuery: () => prisma.field.findUnique({ where: { id }, select: { id: true } }),
      authorizedQuery: () =>
        prisma.field.findFirst({
          where: { id, company: { companyUsers: { some: { userId } } } },
          select: { id: true },
        }),
    });
  }
  if (type === 'production_unit') {
    return resolveEntityAccessReason({
      existsQuery: () => prisma.productionUnit.findUnique({ where: { id }, select: { id: true } }),
      authorizedQuery: () =>
        prisma.productionUnit.findFirst({
          where: {
            id,
            productionUnitsOnFields: {
              some: { field: { company: { companyUsers: { some: { userId } } } } },
            },
          },
          select: { id: true },
        }),
    });
  }
  if (type === 'stock') {
    return resolveEntityAccessReason({
      existsQuery: () => prisma.stock.findUnique({ where: { id }, select: { id: true } }),
      authorizedQuery: () =>
        prisma.stock.findFirst({
          where: {
            id,
            product: { warehouse: { company: { companyUsers: { some: { userId } } } } },
          },
          select: { id: true },
        }),
    });
  }
  return resolveEntityAccessReason({
    existsQuery: () => prisma.file.findUnique({ where: { id }, select: { id: true } }),
    authorizedQuery: () =>
      prisma.file.findFirst({
        where: { id, company: { companyUsers: { some: { userId } } } },
        select: { id: true },
      }),
  });
}

async function resolveEntityAccessReason(params: {
  existsQuery: () => Promise<{ id: string } | null>;
  authorizedQuery: () => Promise<{ id: string } | null>;
}): Promise<MentionResolutionReason> {
  const authorized = await params.authorizedQuery();
  if (authorized) {
    return 'not_found';
  }
  const existing = await params.existsQuery();
  return existing ? 'not_authorized' : 'not_found';
}
