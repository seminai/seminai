import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { AlignProductsUseCase } from '../../../application/use-cases/product/AlignProductsUseCase';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerAlignProducts(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { productIds, companyId } = request.body as {
      productIds?: string[];
      companyId?: string;
    };

    if (!companyId) {
      throw AppError.badRequest('companyId is required', 'MISSING_COMPANY_ID');
    }

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      throw AppError.badRequest(
        'productIds must be a non-empty array of product IDs',
        'INVALID_PRODUCT_IDS',
      );
    }

    if (!this.prisma) {
      throw AppError.internal('Database connection not available', 'DB_NOT_AVAILABLE');
    }

    const useCase = new AlignProductsUseCase(this.prisma);
    const result = await useCase.execute({ productIds, companyId });

    return response.json({
      status: 'success',
      data: result,
    });
  }
