import { Request, Response } from 'express';
import { ProductCategory } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { FitosanitariLookupService } from '../../services/utils/FitosanitariLookupService';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerUpdateAdministrativeStatus(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const fitosanitariService = FitosanitariLookupService.getInstance();

    const allProducts = await this.productRepository.findAllByUserId(request.user.id);

    const updates: Array<{ id: string; administrativeStatus: string | null }> = [];
    for (const product of allProducts) {
      if (product.category !== ProductCategory.PESTICIDE) {
        updates.push({ id: product.id, administrativeStatus: null });
        continue;
      }
      const status = fitosanitariService.lookupStatus(product.registrationNumber, product.name);
      updates.push({ id: product.id, administrativeStatus: status });
    }

    const count = await this.productRepository.updateAdministrativeStatusBulk(updates);

    return response.json({
      status: 'success',
      data: {
        productsUpdated: count,
        totalProducts: allProducts.length,
      },
    });
  }
