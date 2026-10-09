import { createHash } from 'node:crypto';
import { JobCategory, Prisma } from '@prisma/client';
import { AppError } from '../../domain/errors/AppError';
import type { FarmOperationInput } from '../../domain/services/farm/operation-input';
import { convertQuantityToCanonicalUnit } from '../utils/quantityConversion';

export async function requireFarmMember(
  database: Prisma.TransactionClient,
  userId: string,
  companyId: string,
  write = false,
): Promise<void> {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: { isBlocked: true, isDeactivated: true },
  });
  const membership = await database.userOnCompany.findFirst({ where: { userId, companyId } });
  if (
    !user ||
    user.isBlocked ||
    user.isDeactivated ||
    !membership ||
    (write && membership.role === 'VIEWER')
  )
    throw AppError.forbidden('Accesso all’azienda non consentito', 'COMPANY_ACCESS_DENIED');
}

/** Lock products in stable order before reading stock; the preview detects stale approvals. */
export async function previewFarmOperation(
  database: Prisma.TransactionClient,
  input: FarmOperationInput,
) {
  const fingerprint: unknown[] = [input];
  if (input.job) {
    if (!Object.values(JobCategory).includes(input.job.category as JobCategory))
      throw AppError.badRequest('Attività non valida', 'INVALID_CATEGORY');
    const unit = await database.productionUnit.findUnique({
      where: { id: input.job.productionUnitId },
      include: { productionUnitsOnFields: { include: { field: true } } },
    });
    if (
      !unit ||
      !unit.productionUnitsOnFields.length ||
      unit.productionUnitsOnFields.some((link) => link.field.companyId !== input.companyId)
    )
      throw AppError.forbidden('Unità produttiva di un’altra azienda', 'COMPANY_ACCESS_DENIED');
    fingerprint.push(
      unit.updatedAt,
      unit.productionUnitsOnFields.map((link) => [link.field.id, link.field.updatedAt]),
    );
  }
  const balances: Array<{
    productId: string;
    name: string;
    warehouse: string;
    unit: string;
    before: number;
    after: number;
  }> = [];
  for (const productId of [...new Set(input.movements.map((row) => row.productId))].sort()) {
    await database.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    await database.$queryRaw`SELECT id FROM "Stock" WHERE "productId" = ${productId} ORDER BY id FOR UPDATE`;
    const product = await database.product.findUnique({
      where: { id: productId },
      include: {
        warehouse: true,
        stocks: {
          where: { OR: [{ jobId: null }, { job: { isVerified: true } }] },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!product || product.warehouse.companyId !== input.companyId)
      throw AppError.forbidden('Prodotto di un’altra azienda', 'COMPANY_ACCESS_DENIED');
    const movements = input.movements.filter((row) => row.productId === productId);
    const converted = movements.map(
      (row) =>
        convertQuantityToCanonicalUnit(row.quantity * (row.type === 'OUT' ? -1 : 1), row.unit)!,
    );
    const existing = product.stocks.map(
      (row) =>
        convertQuantityToCanonicalUnit(
          row.type === 'OUT'
            ? -Math.abs(row.quantityConverted ?? row.quantity)
            : row.quantityConverted ?? row.quantity,
          row.unitMeasureConverted ?? row.unitOfMeasureQuantity,
        )!,
    );
    if (existing.some((row) => !row || !Number.isFinite(row.quantityConverted)))
      throw AppError.badRequest('Correggi le unità dei movimenti precedenti', 'INCOMPATIBLE_UNITS');
    const units = new Set(
      [...converted, ...existing].map((row) => row.unitMeasureConverted.toLowerCase()),
    );
    if (units.size !== 1)
      throw AppError.badRequest(
        'Unità incompatibili: correggi i movimenti prima di registrare',
        'INCOMPATIBLE_UNITS',
      );
    const before = existing.reduce((sum, row) => sum + row.quantityConverted, 0);
    const after = before + converted.reduce((sum, row) => sum + row.quantityConverted, 0);
    balances.push({
      productId,
      name: product.name,
      warehouse: product.warehouse.name,
      unit: converted[0].unitMeasureConverted,
      before,
      after,
    });
    fingerprint.push(
      product.updatedAt,
      product.stocks.map((row) => [row.id, row.updatedAt, row.quantity]),
    );
  }
  return {
    balances,
    negativeStock: balances.some((row) => row.after < -1e-8),
    fingerprint: createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex'),
  };
}
