import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { CreateOrUpdateProductsAndStocksBulkUseCase, ProductWithStockInput } from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { getProductLabelMatchingQueue } from '../../queue/ProductLabelMatchingQueue';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerCreateOrUpdateBulk(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { companyId, warehouseId, products } = request.body as {
      companyId: string;
      warehouseId?: string;
      products: ProductWithStockInput[];
    };

    if (!companyId || !Array.isArray(products) || products.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    if (!this.stockRepository || !this.warehouseRepository) {
      throw AppError.internal('Required dependencies not initialized', 'MISSING_DEPENDENCIES');
    }

    const useCase = new CreateOrUpdateProductsAndStocksBulkUseCase(
      this.productRepository,
      this.stockRepository,
      this.warehouseRepository,
    );

    const result = await useCase.execute({ companyId, warehouseId, products });

    if (result.productIds.length > 0) {
      try {
        const labelQueue = getProductLabelMatchingQueue();
        await labelQueue.addJob({ productIds: result.productIds });
      } catch (queueError) {
        console.error('[PRODUCT-CONTROLLER] Failed to queue label matching job:', queueError);
      }
    }

    return response.status(200).json({
      status: 'success',
      data: {
        productsCreated: result.productsCreated,
        productsUpdated: result.productsUpdated,
        stocksCreated: result.stocksCreated,
        errors: result.errors,
      },
    });
  }
