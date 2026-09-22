import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { triggerLabelSyncIfStale } from '../../services/product/triggerLabelSyncIfStale';
import type { ProductControllerContext } from './product-controller.context';
import { withPrincipioAttivo } from './product-controller.helpers';

export async function productControllerListByUser(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const companyName = request.query?.companyName as string | undefined;
    const products = await this.productRepository.findManyByUserId(request.user.id, companyName);
    triggerLabelSyncIfStale(request.user.id, products);
    return response.json({
      status: 'success',
      data: { products: products.map(withPrincipioAttivo) },
    });
  }
