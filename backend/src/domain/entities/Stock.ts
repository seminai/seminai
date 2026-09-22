import { randomUUID } from 'node:crypto';
import { Stock as PrismaStock } from '@prisma/client';
import type { CreateStockProps } from '../dtos/stock.dto';
import { File } from './File';

/**
 * Stock domain entity representing a stock movement for a product.
 */
export class Stock {
  constructor(
    public readonly id: string,
    public readonly productId: string,
    public readonly jobId: string | null,
    public readonly quantity: number,
    public readonly unitOfMeasureQuantity: string,
    public readonly price: number,
    public readonly unitOfMeasurePrice: string,
    public readonly type: string,
    public readonly ddtCode: string | null,
    public readonly ddtDate: Date | null,
    public readonly ddtUrlFile: string | null,
    public readonly invoiceCode: string | null,
    public readonly invoiceDate: Date | null,
    public readonly invoiceDueDate: Date | null,
    public readonly invoiceUrlFile: string | null,
    public readonly companySupplierName: string | null,
    public readonly addressSupplier: string | null,
    public readonly vatNumberSupplier: string | null,
    public readonly notes: string | null,
    public readonly packagingInfo: string | null,
    public readonly productNameAsOnDocument: string | null,
    public readonly quantityConverted: number | null,
    public readonly unitMeasureConverted: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly sourceFileId: string | null = null,
    public readonly sourceExtractionId: string | null = null,
    public readonly sourceFile: File | null = null,
    public readonly deliveryNoteId: string | null = null,
  ) {}

  /**
   * Factory method to create a new Stock with generated id and timestamps.
   */
  static create(props: CreateStockProps): Stock {
    return new Stock(
      randomUUID(),
      props.productId,
      props.jobId ?? null,
      props.quantity,
      props.unitOfMeasureQuantity,
      props.price ?? 0,
      props.unitOfMeasurePrice ?? '',
      props.type,
      props.ddtCode ?? null,
      props.ddtDate ?? null,
      props.ddtUrlFile ?? null,
      props.invoiceCode ?? null,
      props.invoiceDate ?? null,
      props.invoiceDueDate ?? null,
      props.invoiceUrlFile ?? null,
      props.companySupplierName ?? null,
      props.addressSupplier ?? null,
      props.vatNumberSupplier ?? null,
      props.notes ?? null,
      props.packagingInfo ?? null,
      props.productNameAsOnDocument ?? null,
      props.quantityConverted ?? null,
      props.unitMeasureConverted ?? null,
      new Date(),
      new Date(),
      props.sourceFileId ?? null,
      props.sourceExtractionId ?? null,
      null,
      props.deliveryNoteId ?? null,
    );
  }

  /**
   * Builds a Stock domain entity from a Prisma Stock record.
   */
  static fromPrisma(prismaStock: PrismaStock): Stock {
    return new Stock(
      prismaStock.id,
      prismaStock.productId,
      prismaStock.jobId ?? null,
      prismaStock.quantity,
      prismaStock.unitOfMeasureQuantity,
      prismaStock.price,
      prismaStock.unitOfMeasurePrice,
      prismaStock.type,
      prismaStock.ddtCode,
      prismaStock.ddtDate ?? null,
      prismaStock.ddtUrlFile,
      prismaStock.invoiceCode,
      prismaStock.invoiceDate ?? null,
      prismaStock.invoiceDueDate ?? null,
      prismaStock.invoiceUrlFile,
      prismaStock.companySupplierName,
      prismaStock.addressSupplier,
      prismaStock.vatNumberSupplier,
      prismaStock.notes ?? null,
      prismaStock.packagingInfo ?? null,
      prismaStock.productNameAsOnDocument ?? null,
      prismaStock.quantityConverted ?? null,
      prismaStock.unitMeasureConverted ?? null,
      prismaStock.createdAt,
      prismaStock.updatedAt,
      prismaStock.sourceFileId ?? null,
      prismaStock.sourceExtractionId ?? null,
      null,
      prismaStock.deliveryNoteId ?? null,
    );
  }

  /**
   * Builds a Stock domain entity from a Prisma Stock record including source file relation.
   */
  static fromPrismaWithRelations(
    prismaStock: PrismaStock & {
      sourceFile?: {
        id: string;
        name: string;
        url: string;
        companyId: string;
        path: string | null;
        type: string | null;
        metadata: unknown;
        createdAt: Date;
        updatedAt: Date;
      } | null;
    },
  ): Stock {
    return new Stock(
      prismaStock.id,
      prismaStock.productId,
      prismaStock.jobId ?? null,
      prismaStock.quantity,
      prismaStock.unitOfMeasureQuantity,
      prismaStock.price,
      prismaStock.unitOfMeasurePrice,
      prismaStock.type,
      prismaStock.ddtCode,
      prismaStock.ddtDate ?? null,
      prismaStock.ddtUrlFile,
      prismaStock.invoiceCode,
      prismaStock.invoiceDate ?? null,
      prismaStock.invoiceDueDate ?? null,
      prismaStock.invoiceUrlFile,
      prismaStock.companySupplierName,
      prismaStock.addressSupplier,
      prismaStock.vatNumberSupplier,
      prismaStock.notes ?? null,
      prismaStock.packagingInfo ?? null,
      prismaStock.productNameAsOnDocument ?? null,
      prismaStock.quantityConverted ?? null,
      prismaStock.unitMeasureConverted ?? null,
      prismaStock.createdAt,
      prismaStock.updatedAt,
      prismaStock.sourceFileId ?? null,
      prismaStock.sourceExtractionId ?? null,
      prismaStock.sourceFile
        ? new File(
            prismaStock.sourceFile.id,
            prismaStock.sourceFile.name,
            prismaStock.sourceFile.url,
            prismaStock.sourceFile.companyId,
            prismaStock.sourceFile.path ?? undefined,
            prismaStock.sourceFile.type ?? undefined,
            prismaStock.sourceFile.metadata ?? undefined,
            prismaStock.sourceFile.createdAt,
            prismaStock.sourceFile.updatedAt,
          )
        : null,
      prismaStock.deliveryNoteId ?? null,
    );
  }
}
