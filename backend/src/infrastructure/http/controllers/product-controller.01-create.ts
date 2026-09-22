import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { CreateProductUseCase, CreateProductDTO } from '../../../application/use-cases/product/CreateProductUseCase';
import { toTitleCase } from '../../../utils/string.util';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerCreate(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const body = request.body as CreateProductDTO;

    const useCase = new CreateProductUseCase(this.productRepository, this.stockRepository!);
    const { product } = await useCase.execute({
      warehouseId: body.warehouseId,
      name: body.name ? toTitleCase(body.name) : body.name,
      sku: body.sku,
      barcode: body.barcode ?? null,
      category: body.category,
      type: body.type,
      description: body.description ?? null,
      registrationNumber: body.registrationNumber ?? null,
      labelUrl: body.labelUrl ?? null,
      labelMetadata: body.labelMetadata ?? null,
      vintage: body.vintage ?? null,
      unitPrice: body.unitPrice ?? null,
      vatRate: body.vatRate ?? null,
      unitOfMeasure: body.unitOfMeasure ?? null,
      isActive: body.isActive ?? true,
      stock: body.stock ?? null,
    });

    return response.status(201).json({ status: 'success', data: { product } });
  }
