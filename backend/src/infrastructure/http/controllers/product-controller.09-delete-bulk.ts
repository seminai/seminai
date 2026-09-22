import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { DeleteProductsBulkUseCase } from '../../../application/use-cases/product/DeleteProductsBulkUseCase';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerDeleteBulk(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { companyId, ids } = request.body as {
      companyId: string;
      ids: string[];
    };

    if (!companyId || !Array.isArray(ids) || ids.length === 0) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const useCase = new DeleteProductsBulkUseCase(this.productRepository);
    await useCase.execute({ companyId, ids });
    return response.status(204).send();
  }
