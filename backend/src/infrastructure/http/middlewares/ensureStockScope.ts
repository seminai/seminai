import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../repositories/Prisma';
import { AppError } from '../../../domain/errors/AppError';

/** Match the actual movement/product owner, and preserve confirmed journal entries. */
export async function ensureStockScope(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const companyId = request.query.companyId || request.body?.companyId;
  if (typeof companyId !== 'string')
    throw AppError.badRequest('Company ID not provided', 'MISSING_COMPANY_ID');
  const stockId = request.params.stockId;
  if (stockId) {
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: {
        operationId: true,
        product: { select: { warehouse: { select: { companyId: true } } } },
      },
    });
    if (!stock || stock.product.warehouse.companyId !== companyId)
      throw AppError.notFound('Stock not found', 'STOCK_NOT_FOUND');
    if (stock.operationId)
      throw AppError.conflict(
        'Il movimento è registrato nel quaderno. Registra un movimento di rettifica per conservarne lo storico.',
        'JOURNAL_MOVEMENT_IMMUTABLE',
      );
  }
  if (request.body?.productId) {
    const product = await prisma.product.findFirst({
      where: { id: request.body.productId, warehouse: { companyId } },
      select: { id: true },
    });
    if (!product) throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  }
  next();
}
