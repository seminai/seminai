import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { Stock } from '../../../domain/entities/Stock';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { Stock as PrismaStock } from '@prisma/client';
import { FileService } from '../../services/FileService';
import { UpdateStockProps } from '../../../domain/dtos/stock.dto';

// Extend PrismaStock to include new fields if they are not yet generated in the client
interface ExtendedStockInput
  extends Partial<
    Omit<
      PrismaStock,
      'id' | 'createdAt' | 'updatedAt' | 'ddtDate' | 'invoiceDate' | 'invoiceDueDate'
    >
  > {
  ddtDate?: string | Date | null;
  invoiceDate?: string | Date | null;
  invoiceDueDate?: string | Date | null;
}

export class StockController {
  constructor(private readonly stockRepository: IStockRepository) {}

  private normalizeStockType(type: string): 'IN' | 'OUT' {
    const normalizedType = String(type ?? '')
      .trim()
      .toUpperCase();
    if (normalizedType !== 'IN' && normalizedType !== 'OUT') {
      throw AppError.badRequest('type must be IN or OUT', 'INVALID_TYPE');
    }
    return normalizedType;
  }

  private normalizeStockQuantity(type: 'IN' | 'OUT', quantity: number): number {
    return type === 'OUT' ? -Math.abs(quantity) : Math.abs(quantity);
  }

  async create(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const {
      productId,
      jobId = null,
      quantity,
      unitOfMeasureQuantity,
      price,
      unitOfMeasurePrice,
      type,
      ddtCode = null,
      ddtDate = null,
      ddtUrlFile = null,
      invoiceCode = null,
      invoiceDate = null,
      invoiceDueDate = null,
      invoiceUrlFile = null,
      companySupplierName = null,
      addressSupplier = null,
      vatNumberSupplier = null,
    } = request.body as ExtendedStockInput;

    if (
      !productId ||
      typeof quantity !== 'number' ||
      !unitOfMeasureQuantity ||
      typeof price !== 'number' ||
      !unitOfMeasurePrice ||
      !type
    ) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }
    if (price < 0) {
      throw AppError.badRequest('price must be >= 0', 'INVALID_PRICE');
    }
    const normalizedType = this.normalizeStockType(type);
    const normalizedQuantity = this.normalizeStockQuantity(normalizedType, quantity);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any = {
      productId,
      jobId,
      quantity: normalizedQuantity,
      unitOfMeasureQuantity,
      price,
      unitOfMeasurePrice,
      type: normalizedType,
      ddtCode,
      ddtDate: ddtDate ? new Date(ddtDate) : null,
      ddtUrlFile,
      invoiceCode,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      invoiceDueDate: invoiceDueDate ? new Date(invoiceDueDate) : null,
      invoiceUrlFile,
      companySupplierName,
      addressSupplier,
      vatNumberSupplier,
    };

    const entity = Stock.create(input);
    const created = await this.stockRepository.create(entity);
    return response.status(201).json({ status: 'success', data: { stock: created } });
  }

  async upload(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { stockId } = request.params as { stockId: string };
    const { fileType } = request.body as { fileType?: string };

    if (!stockId) {
      throw AppError.badRequest('Missing stockId param', 'MISSING_STOCK_ID');
    }

    if (!request.file) {
      throw AppError.badRequest('Missing file', 'MISSING_FILE');
    }

    if (!fileType || (fileType !== 'ddt' && fileType !== 'invoice')) {
      throw AppError.badRequest('Invalid fileType. Expected ddt or invoice', 'INVALID_FILE_TYPE');
    }

    const path = fileType === 'ddt' ? 'stocks/ddt' : 'stocks/invoice';
    const fileService = new FileService();
    const publicUrl = await fileService.uploadFile(request.file, request.user.id, path, fileType);

    const updated = await this.stockRepository.updateFileUrl(
      stockId,
      fileType === 'ddt' ? { ddtUrlFile: publicUrl } : { invoiceUrlFile: publicUrl },
    );

    return response.status(200).json({ status: 'success', data: { stock: updated } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { stockId } = request.params as { stockId: string };
    if (!stockId) {
      throw AppError.badRequest('Missing stockId param', 'MISSING_STOCK_ID');
    }
    const context = await this.stockRepository.findDeletionContext(stockId);
    if (!context) {
      throw AppError.notFound('Stock not found', 'STOCK_NOT_FOUND');
    }
    if (context.jobId && context.isJobVerified) {
      throw AppError.conflict(
        'Cannot delete a stock linked to a verified job',
        'STOCK_LINKED_TO_VERIFIED_JOB',
      );
    }
    await this.stockRepository.delete(stockId);
    return response.status(200).json({ status: 'success', data: { id: stockId } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { stockId } = request.params as { stockId: string };
    if (!stockId) {
      throw AppError.badRequest('Missing stockId param', 'MISSING_STOCK_ID');
    }
    const body = request.body as ExtendedStockInput;
    const updateData: UpdateStockProps = {};
    if (body.productId !== undefined) updateData.productId = body.productId;
    if (body.quantity !== undefined) {
      if (typeof body.quantity !== 'number') {
        throw AppError.badRequest('quantity must be a number', 'INVALID_QUANTITY');
      }
      updateData.quantity = body.quantity;
    }
    if (body.unitOfMeasureQuantity !== undefined)
      updateData.unitOfMeasureQuantity = body.unitOfMeasureQuantity;
    if (body.price !== undefined) {
      if (typeof body.price !== 'number') {
        throw AppError.badRequest('price must be a number', 'INVALID_PRICE');
      }
      if (body.price < 0) {
        throw AppError.badRequest('price must be >= 0', 'INVALID_PRICE');
      }
      updateData.price = body.price;
    }
    if (body.unitOfMeasurePrice !== undefined)
      updateData.unitOfMeasurePrice = body.unitOfMeasurePrice;
    const normalizedType = body.type !== undefined ? this.normalizeStockType(body.type) : undefined;
    if (normalizedType !== undefined) updateData.type = normalizedType;
    if (body.quantity !== undefined && normalizedType !== undefined) {
      updateData.quantity = this.normalizeStockQuantity(normalizedType, body.quantity);
    }
    if (body.ddtCode !== undefined) updateData.ddtCode = body.ddtCode;
    if (body.ddtDate !== undefined)
      updateData.ddtDate = body.ddtDate
        ? body.ddtDate instanceof Date
          ? body.ddtDate
          : new Date(body.ddtDate)
        : null;
    if (body.ddtUrlFile !== undefined) updateData.ddtUrlFile = body.ddtUrlFile;
    if (body.invoiceCode !== undefined) updateData.invoiceCode = body.invoiceCode;
    if (body.invoiceDate !== undefined)
      updateData.invoiceDate = body.invoiceDate
        ? body.invoiceDate instanceof Date
          ? body.invoiceDate
          : new Date(body.invoiceDate)
        : null;
    if (body.invoiceDueDate !== undefined)
      updateData.invoiceDueDate = body.invoiceDueDate
        ? body.invoiceDueDate instanceof Date
          ? body.invoiceDueDate
          : new Date(body.invoiceDueDate)
        : null;
    if (body.invoiceUrlFile !== undefined) updateData.invoiceUrlFile = body.invoiceUrlFile;
    if (body.companySupplierName !== undefined)
      updateData.companySupplierName = body.companySupplierName;
    if (body.addressSupplier !== undefined) updateData.addressSupplier = body.addressSupplier;
    if (body.vatNumberSupplier !== undefined) updateData.vatNumberSupplier = body.vatNumberSupplier;
    if (body.jobId !== undefined) updateData.jobId = body.jobId;
    if (Object.keys(updateData).length === 0) {
      throw AppError.badRequest('No fields to update', 'NO_FIELDS_TO_UPDATE');
    }
    const updated = await this.stockRepository.update(stockId, updateData);
    return response.status(200).json({ status: 'success', data: { stock: updated } });
  }
}
