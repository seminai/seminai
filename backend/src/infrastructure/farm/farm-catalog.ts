import { prisma } from '../repositories/Prisma';
import { requireFarmMember } from './farm-preview';
import { AppError } from '../../domain/errors/AppError';

/** Bounded catalog shared by the UI and scoped MCP connections. */
export async function readFarmCatalog(
  userId: string,
  companyId: string,
  kind: string,
  search = '',
  offset = 0,
) {
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw AppError.badRequest('Pagina non valida', 'INVALID_PAGE');
  await requireFarmMember(prisma, userId, companyId);
  const name = { contains: search.slice(0, 200), mode: 'insensitive' as const };
  if (kind === 'products')
    return prisma.product.findMany({
      where: { warehouse: { companyId }, name },
      include: {
        warehouse: { select: { id: true, name: true } },
        stocks: {
          where: { OR: [{ jobId: null }, { job: { isVerified: true } }] },
          select: {
            id: true,
            type: true,
            quantity: true,
            unitOfMeasureQuantity: true,
            quantityConverted: true,
            unitMeasureConverted: true,
            occurredAt: true,
          },
        },
      },
      take: 100,
      skip: offset,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  if (kind === 'warehouses')
    return prisma.warehouse.findMany({
      where: { companyId, name },
      take: 100,
      skip: offset,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  if (kind === 'fields')
    return prisma.field.findMany({
      where: { companyId, name },
      take: 100,
      skip: offset,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  if (kind === 'production-units')
    return prisma.productionUnit.findMany({
      where: {
        name,
        productionUnitsOnFields: {
          some: { field: { companyId } },
          every: { field: { companyId } },
        },
      },
      take: 100,
      skip: offset,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  if (kind === 'movements')
    return prisma.stock.findMany({
      where: { product: { warehouse: { companyId }, name } },
      include: { product: { select: { name: true, warehouseId: true } } },
      take: 100,
      skip: offset,
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
    });
  if (kind === 'jobs')
    return prisma.job.findMany({
      where: {
        productionUnit: {
          productionUnitsOnFields: {
            some: { field: { companyId } },
            every: { field: { companyId } },
          },
        },
      },
      include: { productionUnit: { select: { name: true } }, stocks: true },
      take: 100,
      skip: offset,
      orderBy: [{ dateOfOpeation: 'desc' }, { id: 'asc' }],
    });
  throw AppError.badRequest('Catalogo non riconosciuto', 'INVALID_CATALOG');
}
