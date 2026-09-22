import { randomUUID } from 'node:crypto';
import { Product as PrismaProduct, ProductCategory } from '@prisma/client';

/**
 * Product domain entity representing an item stored in a warehouse.
 */
export class Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly sku: string,
    public readonly barcode: string | null,
    public readonly category: ProductCategory,
    public readonly type: string,
    public readonly description: string | null,
    public readonly administrativeStatus: string | null,
    public readonly registrationNumber: string | null,
    public readonly labelUrl: string | null,
    public readonly labelMetadata: unknown | null,
    public readonly warehouseId: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    // Sales attributes (modulo vendite) — appended with defaults to preserve
    // existing positional construction.
    public readonly vintage: number | null = null,
    public readonly unitPrice: number | null = null,
    public readonly vatRate: number | null = null,
    public readonly unitOfMeasure: string | null = null,
    public readonly isActive: boolean = true,
  ) {}

  /**
   * Factory method to create a new Product with generated id and timestamps.
   * Fertilizer nutrient fields on the Prisma model are intentionally not part of
   * the domain entity; they are managed by the FertilizerProductRepository layer.
   */
  static create(
    props: Omit<
      PrismaProduct,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'nitrogen'
      | 'phosphorus'
      | 'potassium'
      | 'magnesium'
      | 'calcium'
      | 'sulfur'
      | 'boron'
      | 'unitOfFertilizer'
      | 'vintage'
      | 'unitPrice'
      | 'vatRate'
      | 'unitOfMeasure'
      | 'isActive'
    > &
      Partial<
        Pick<PrismaProduct, 'vintage' | 'unitPrice' | 'vatRate' | 'unitOfMeasure' | 'isActive'>
      >,
  ): Product {
    return new Product(
      randomUUID(),
      props.name,
      props.sku,
      props.barcode ?? null,
      props.category,
      props.type,
      props.description ?? null,
      props.administrativeStatus ?? null,
      props.registrationNumber ?? null,
      props.labelUrl ?? null,
      props.labelMetadata ?? null,
      props.warehouseId,
      new Date(),
      new Date(),
      props.vintage ?? null,
      props.unitPrice ?? null,
      props.vatRate ?? null,
      props.unitOfMeasure ?? null,
      props.isActive ?? true,
    );
  }

  /**
   * Builds a Product domain entity from a Prisma Product record.
   */
  static fromPrisma(prismaProduct: PrismaProduct): Product {
    return new Product(
      prismaProduct.id,
      prismaProduct.name,
      prismaProduct.sku,
      prismaProduct.barcode,
      prismaProduct.category,
      prismaProduct.type,
      prismaProduct.description,
      prismaProduct.administrativeStatus,
      prismaProduct.registrationNumber,
      prismaProduct.labelUrl,
      prismaProduct.labelMetadata,
      prismaProduct.warehouseId,
      prismaProduct.createdAt,
      prismaProduct.updatedAt,
      prismaProduct.vintage,
      prismaProduct.unitPrice,
      prismaProduct.vatRate,
      prismaProduct.unitOfMeasure,
      prismaProduct.isActive,
    );
  }
}
