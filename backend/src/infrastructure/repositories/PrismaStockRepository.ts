import { PrismaClient } from '@prisma/client';
import { Stock } from '../../domain/entities/Stock';
import { IStockRepository } from '../../domain/repositories/IStockRepository';
import { UpdateStockProps } from '../../domain/dtos/stock.dto';
import { calculateAggregatedStock } from '../services/agents/dosage_agent/stockAggregator';

export class PrismaStockRepository implements IStockRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getAvailableQuantity(productId: string, companyId: string): Promise<number> {
    const result = await calculateAggregatedStock(this.prisma, { productId, companyId });
    return result.availableStock;
  }

  async create(stock: Stock): Promise<Stock> {
    const created = await this.prisma.stock.create({
      data: {
        id: stock.id,
        productId: stock.productId,
        sourceFileId: stock.sourceFileId ?? undefined,
        sourceExtractionId: stock.sourceExtractionId ?? undefined,
        jobId: stock.jobId ?? undefined,
        quantity: stock.quantity,
        unitOfMeasureQuantity: stock.unitOfMeasureQuantity,
        price: stock.price,
        unitOfMeasurePrice: stock.unitOfMeasurePrice,
        type: stock.type,
        ddtCode: stock.ddtCode ?? undefined,
        ddtDate: stock.ddtDate ?? undefined,
        ddtUrlFile: stock.ddtUrlFile ?? undefined,
        invoiceCode: stock.invoiceCode ?? undefined,
        invoiceDate: stock.invoiceDate ?? undefined,
        invoiceDueDate: stock.invoiceDueDate ?? undefined,
        invoiceUrlFile: stock.invoiceUrlFile ?? undefined,
        companySupplierName: stock.companySupplierName ?? undefined,
        addressSupplier: stock.addressSupplier ?? undefined,
        vatNumberSupplier: stock.vatNumberSupplier ?? undefined,
        notes: stock.notes ?? undefined,
        packagingInfo: stock.packagingInfo ?? undefined,
        productNameAsOnDocument: stock.productNameAsOnDocument ?? undefined,
        quantityConverted: stock.quantityConverted ?? undefined,
        unitMeasureConverted: stock.unitMeasureConverted ?? undefined,
        deliveryNoteId: stock.deliveryNoteId ?? undefined,
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt,
      },
    });
    return Stock.fromPrisma(created);
  }

  async createMany(stocks: Stock[]): Promise<void> {
    if (stocks.length === 0) return;
    await this.prisma.stock.createMany({
      data: stocks.map((stock) => ({
        id: stock.id,
        productId: stock.productId,
        sourceFileId: stock.sourceFileId ?? undefined,
        sourceExtractionId: stock.sourceExtractionId ?? undefined,
        jobId: stock.jobId ?? undefined,
        quantity: stock.quantity,
        unitOfMeasureQuantity: stock.unitOfMeasureQuantity,
        price: stock.price,
        unitOfMeasurePrice: stock.unitOfMeasurePrice,
        type: stock.type,
        ddtCode: stock.ddtCode ?? undefined,
        ddtDate: stock.ddtDate ?? undefined,
        ddtUrlFile: stock.ddtUrlFile ?? undefined,
        invoiceCode: stock.invoiceCode ?? undefined,
        invoiceDate: stock.invoiceDate ?? undefined,
        invoiceDueDate: stock.invoiceDueDate ?? undefined,
        invoiceUrlFile: stock.invoiceUrlFile ?? undefined,
        companySupplierName: stock.companySupplierName ?? undefined,
        addressSupplier: stock.addressSupplier ?? undefined,
        vatNumberSupplier: stock.vatNumberSupplier ?? undefined,
        notes: stock.notes ?? undefined,
        packagingInfo: stock.packagingInfo ?? undefined,
        productNameAsOnDocument: stock.productNameAsOnDocument ?? undefined,
        quantityConverted: stock.quantityConverted ?? undefined,
        unitMeasureConverted: stock.unitMeasureConverted ?? undefined,
        deliveryNoteId: stock.deliveryNoteId ?? undefined,
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt,
      })),
    });
  }

  async deleteByJobId(jobId: string): Promise<void> {
    await this.prisma.stock.deleteMany({ where: { jobId } });
  }

  async deleteBySourceFileIds(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.stock.deleteMany({
      where: { sourceFileId: { in: [...ids] } },
    });
    return result.count;
  }

  async deleteByCompanyId(companyId: string): Promise<number> {
    const result = await this.prisma.stock.deleteMany({
      where: { product: { warehouse: { companyId } } },
    });
    return result.count;
  }

  async updateFileUrl(
    stockId: string,
    update: { ddtUrlFile?: string | null; invoiceUrlFile?: string | null },
  ): Promise<Stock> {
    const updated = await this.prisma.stock.update({
      where: { id: stockId },
      data: {
        ddtUrlFile: update.ddtUrlFile ?? undefined,
        invoiceUrlFile: update.invoiceUrlFile ?? undefined,
      },
    });
    return Stock.fromPrisma(updated);
  }

  async findDeletionContext(
    stockId: string,
  ): Promise<{ jobId: string | null; isJobVerified: boolean | null } | null> {
    const stock = await this.prisma.stock.findUnique({
      where: { id: stockId },
      select: { jobId: true, job: { select: { isVerified: true } } },
    });
    if (!stock) return null;
    return {
      jobId: stock.jobId ?? null,
      isJobVerified: stock.job?.isVerified ?? null,
    };
  }

  async delete(stockId: string): Promise<void> {
    await this.prisma.stock.delete({ where: { id: stockId } });
  }

  async update(stockId: string, update: UpdateStockProps): Promise<Stock> {
    const updateData: Record<string, unknown> = {};
    if (update.productId !== undefined) updateData.productId = update.productId;
    if (update.sourceFileId !== undefined) updateData.sourceFileId = update.sourceFileId ?? null;
    if (update.sourceExtractionId !== undefined) {
      updateData.sourceExtractionId = update.sourceExtractionId ?? null;
    }
    if (update.quantity !== undefined) updateData.quantity = update.quantity;
    if (update.unitOfMeasureQuantity !== undefined)
      updateData.unitOfMeasureQuantity = update.unitOfMeasureQuantity;
    if (update.price !== undefined) updateData.price = update.price;
    if (update.unitOfMeasurePrice !== undefined)
      updateData.unitOfMeasurePrice = update.unitOfMeasurePrice;
    if (update.type !== undefined) updateData.type = update.type;
    if (update.ddtCode !== undefined) updateData.ddtCode = update.ddtCode ?? undefined;
    if (update.ddtDate !== undefined)
      updateData.ddtDate = update.ddtDate
        ? update.ddtDate instanceof Date
          ? update.ddtDate
          : new Date(update.ddtDate)
        : null;
    if (update.ddtUrlFile !== undefined) updateData.ddtUrlFile = update.ddtUrlFile ?? undefined;
    if (update.invoiceCode !== undefined) updateData.invoiceCode = update.invoiceCode ?? undefined;
    if (update.invoiceDate !== undefined)
      updateData.invoiceDate = update.invoiceDate
        ? update.invoiceDate instanceof Date
          ? update.invoiceDate
          : new Date(update.invoiceDate)
        : null;
    if (update.invoiceDueDate !== undefined)
      updateData.invoiceDueDate = update.invoiceDueDate
        ? update.invoiceDueDate instanceof Date
          ? update.invoiceDueDate
          : new Date(update.invoiceDueDate)
        : null;
    if (update.invoiceUrlFile !== undefined)
      updateData.invoiceUrlFile = update.invoiceUrlFile ?? undefined;
    if (update.companySupplierName !== undefined)
      updateData.companySupplierName = update.companySupplierName ?? undefined;
    if (update.addressSupplier !== undefined)
      updateData.addressSupplier = update.addressSupplier ?? undefined;
    if (update.vatNumberSupplier !== undefined)
      updateData.vatNumberSupplier = update.vatNumberSupplier ?? undefined;
    if (update.notes !== undefined) updateData.notes = update.notes ?? undefined;
    if (update.packagingInfo !== undefined)
      updateData.packagingInfo = update.packagingInfo ?? undefined;
    if (update.productNameAsOnDocument !== undefined)
      updateData.productNameAsOnDocument = update.productNameAsOnDocument ?? undefined;
    if (update.quantityConverted !== undefined)
      updateData.quantityConverted = update.quantityConverted ?? undefined;
    if (update.unitMeasureConverted !== undefined)
      updateData.unitMeasureConverted = update.unitMeasureConverted ?? undefined;
    if (update.jobId !== undefined) updateData.jobId = update.jobId ?? undefined;
    const updated = await this.prisma.stock.update({
      where: { id: stockId },
      data: updateData,
    });
    return Stock.fromPrisma(updated);
  }
}
