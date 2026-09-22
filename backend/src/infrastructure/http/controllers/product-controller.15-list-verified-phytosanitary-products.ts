import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { ListVerifiedPhytosanitaryProductsUseCase } from '../../../application/use-cases/product/ListVerifiedPhytosanitaryProductsUseCase';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerListVerifiedPhytosanitaryProducts(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const companyId = request.query.companyId as string | undefined;

    const useCase = new ListVerifiedPhytosanitaryProductsUseCase(this.productRepository);
    const result = await useCase.execute({
      userId: request.user.id,
      companyId,
    });

    return response.json({
      status: 'success',
      data: result,
    });
  }
