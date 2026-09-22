import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { CreateProductDTO } from '../../../application/use-cases/product/CreateProductUseCase';
import { CreateProductsBulkUseCase } from '../../../application/use-cases/product/CreateProductsBulkUseCase';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerCreateBulk(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { warehouseId, products } = request.body as {
      warehouseId: string;
      products: Array<Omit<CreateProductDTO, 'warehouseId'>>;
    };

    if (!warehouseId || !Array.isArray(products) || products.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const useCase = new CreateProductsBulkUseCase(this.productRepository, this.stockRepository!);
    const { products: created, stockErrors } = await useCase.execute({ warehouseId, products });
    return response.status(201).json({
      status: 'success',
      data: { products: created, stockErrors },
    });
  }
