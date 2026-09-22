import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { ProductControllerContext } from './product-controller.context';
import { withPrincipioAttivo } from './product-controller.helpers';

export async function productControllerFindById(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }
    return response.json({ status: 'success', data: { product: withPrincipioAttivo(product) } });
  }
