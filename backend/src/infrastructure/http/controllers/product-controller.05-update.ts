import { Request, Response } from 'express';
import { ProductCategory } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { Product } from '../../../domain/entities/Product';
import { FitosanitariLookupService } from '../../services/utils/FitosanitariLookupService';
import { mapToProductCategory } from '../../../application/use-cases/product/product-category.mapper';
import { toTitleCase } from '../../../utils/string.util';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerUpdate(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const updateData = request.body as Partial<Product>;

    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }

    const finalName =
      typeof updateData.name !== 'undefined' ? toTitleCase(updateData.name) : existing.name;
    const finalRegistrationNumber =
      typeof updateData.registrationNumber !== 'undefined'
        ? updateData.registrationNumber?.trim() ?? null
        : existing.registrationNumber?.trim() ?? null;
    const finalCategory = mapToProductCategory(
      typeof updateData.category !== 'undefined' ? updateData.category : existing.category,
      finalRegistrationNumber,
    );
    const fitosanitariService = FitosanitariLookupService.getInstance();
    const administrativeStatus =
      finalCategory === ProductCategory.PESTICIDE
        ? fitosanitariService.lookupStatus(finalRegistrationNumber, finalName)
        : null;
    const normalizedUpdateData: Partial<Product> = {
      ...updateData,
      name: finalName,
      category: finalCategory,
      registrationNumber: finalRegistrationNumber,
      administrativeStatus,
    };
    const updated = await this.productRepository.update(id, normalizedUpdateData);
    return response.json({ status: 'success', data: { product: updated } });
  }
