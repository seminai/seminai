import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { ImportProductsFromCsvExcelUseCase } from '../../../application/use-cases/product/ImportProductsFromCsvExcelUseCase';
import { getProductLabelMatchingQueue } from '../../queue/ProductLabelMatchingQueue';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerImportFromCsvExcel(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    const { companyId, warehouseId, sourceFileId } = request.body as {
      companyId: string;
      warehouseId?: string;
      sourceFileId?: string;
    };
    const preview =
      String(request.query.preview ?? request.body.preview ?? '').toLowerCase() === 'true';

    if (!companyId) {
      throw AppError.badRequest('companyId is required', 'MISSING_COMPANY_ID');
    }

    if (!this.stockRepository || !this.warehouseRepository || !this.prisma) {
      throw AppError.internal('Required dependencies not initialized', 'MISSING_DEPENDENCIES');
    }

    const useCase = new ImportProductsFromCsvExcelUseCase(
      this.productRepository,
      this.stockRepository,
      this.warehouseRepository,
    );

    const result = await useCase.execute({
      companyId,
      warehouseId,
      sourceFileId,
      fileBuffer: file.buffer,
      fileName: file.originalname,
      preview,
    });

    if (preview) {
      return response.status(200).json({
        status: 'success',
        data: {
          products: result.previewProducts ?? [],
          errors: result.errors,
        },
      });
    }

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
