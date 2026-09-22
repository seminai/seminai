import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerDelete(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }
    await this.productRepository.delete(id);
    return response.status(204).send();
  }
