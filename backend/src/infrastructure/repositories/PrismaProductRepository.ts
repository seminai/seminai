import { Prisma, PrismaClient, ProductCategory } from '@prisma/client';
import { Product } from '../../domain/entities/Product';
import {
  IProductRepository,
  ProductWithRelations,
} from '../../domain/repositories/IProductRepository';

const VERIFIED_STOCK_WHERE: Prisma.StockWhereInput = {
  OR: [{ jobId: null }, { job: { isVerified: true } }],
};

const STOCK_RELATIONS_INCLUDE = {
  sourceFile: true,
  job: {
    select: {
      id: true,
      isVerified: true,
      dateOfOpeation: true,
      category: true,
      quantity: true,
      unitOfMeasureQuantity: true,
      productQuantityTreated: true,
      unitOfMeasureProductQuantityTreated: true,
      modeOfApplication: true,
      avversity: true,
      giustification: true,
      treatedSurface: true,
      isLocalizedTreatment: true,
      note: true,
      totalDistributedWaterL: true,
      createdAt: true,
      updatedAt: true,
      productionUnit: {
        select: {
          id: true,
          name: true,
          areaHa: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          updatedAt: true,
          cycles: {
            orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
            take: 1,
            select: {
              id: true,
              cropName: true,
              cropType: true,
              variety: true,
              protocoll: true,
              protectionStructure: true,
              floweringDate: true,
              harvestingDate: true,
              occupazione: true,
              destinazioneDiUso: true,
              acquaTotalePeridoL: true,
              seasonYear: true,
              cycleIndex: true,
            },
          },
          productionUnitsOnFields: {
            select: {
              id: true,
              areaHaOnField: true,
              field: {
                select: {
                  id: true,
                  companyId: true,
                  name: true,
                  coordinates: true,
                  latitude: true,
                  longitude: true,
                  polygon: true,
                  gisHa: true,
                  sauHa: true,
                  ph: true,
                  nitrogen: true,
                  phosphorus: true,
                  potassium: true,
                  calcium: true,
                  magnesium: true,
                  soilType: true,
                  uso: true,
                  qualita: true,
                  superficieCatastaleMq: true,
                  sezione: true,
                  foglio: true,
                  particella: true,
                  subalterno: true,
                  nation: true,
                  region: true,
                  city: true,
                  address: true,
                  cap: true,
                  variazioneMq: true,
                  inizioConduzione: true,
                  fineConduzione: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StockInclude;

const WAREHOUSE_RELATIONS_SELECT = {
  name: true,
  company: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.WarehouseSelect;

export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(product: Product): Promise<Product> {
    const created = await this.prisma.product.create({
      data: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        category: product.category,
        type: product.type,
        description: product.description,
        registrationNumber: product.registrationNumber,
        labelUrl: product.labelUrl,
        labelMetadata:
          product.labelMetadata !== null && typeof product.labelMetadata !== 'undefined'
            ? (product.labelMetadata as Prisma.InputJsonValue)
            : undefined,
        warehouseId: product.warehouseId,
        vintage: product.vintage,
        unitPrice: product.unitPrice,
        vatRate: product.vatRate,
        unitOfMeasure: product.unitOfMeasure,
        isActive: product.isActive,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
    });
    return Product.fromPrisma(created);
  }

  async createMany(products: Product[]): Promise<void> {
    if (products.length === 0) return;
    await this.prisma.product.createMany({
      data: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode ?? undefined,
        category: product.category,
        type: product.type,
        description: product.description ?? undefined,
        registrationNumber: product.registrationNumber ?? undefined,
        labelUrl: product.labelUrl ?? undefined,
        labelMetadata:
          product.labelMetadata !== null && typeof product.labelMetadata !== 'undefined'
            ? (product.labelMetadata as Prisma.InputJsonValue)
            : undefined,
        warehouseId: product.warehouseId,
        vintage: product.vintage ?? undefined,
        unitPrice: product.unitPrice ?? undefined,
        vatRate: product.vatRate ?? undefined,
        unitOfMeasure: product.unitOfMeasure ?? undefined,
        isActive: product.isActive,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      })),
    });
  }

  async findById(id: string): Promise<ProductWithRelations | null> {
    const found = await this.prisma.product.findUnique({
      where: { id },
      include: {
        stocks: {
          where: VERIFIED_STOCK_WHERE,
          include: STOCK_RELATIONS_INCLUDE,
        },
        warehouse: {
          select: WAREHOUSE_RELATIONS_SELECT,
        },
      },
    });
    if (!found) return null;
    return found;
  }

  async findManyByWarehouseId(warehouseId: string): Promise<ProductWithRelations[]> {
    const list = await this.prisma.product.findMany({
      where: { warehouseId },
      include: {
        stocks: {
          where: VERIFIED_STOCK_WHERE,
          include: STOCK_RELATIONS_INCLUDE,
        },
        warehouse: {
          select: WAREHOUSE_RELATIONS_SELECT,
        },
      },
    });
    return list;
  }

  async findManyByUserId(userId: string, companyName?: string): Promise<ProductWithRelations[]> {
    const companyFilter: Prisma.CompanyWhereInput = companyName
      ? { name: { contains: companyName, mode: 'insensitive' } }
      : {};
    return this.prisma.product.findMany({
      where: {
        warehouse: {
          company: {
            ...companyFilter,
            companyUsers: { some: { userId } },
          },
        },
      },
      include: {
        stocks: {
          where: VERIFIED_STOCK_WHERE,
          include: STOCK_RELATIONS_INCLUDE,
        },
        warehouse: {
          select: WAREHOUSE_RELATIONS_SELECT,
        },
      },
    });
  }

  async findManyByCompanyId(companyId: string): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      where: { warehouse: { companyId } },
    });
    return products.map((p) => Product.fromPrisma(p));
  }

  async findByNameAndWarehouseId(name: string, warehouseId: string): Promise<Product | null> {
    const found = await this.prisma.product.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        warehouseId,
      },
    });
    if (!found) return null;
    return Product.fromPrisma(found);
  }

  async findAllWithRegistrationNumber(): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      where: {
        registrationNumber: { not: null },
      },
    });
    return products.map((p) => Product.fromPrisma(p));
  }

  async findAllWithRegistrationNumberByUserId(userId: string): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      where: {
        registrationNumber: { not: null },
        warehouse: { company: { companyUsers: { some: { userId } } } },
      },
    });
    return products.map((p) => Product.fromPrisma(p));
  }

  async findAllByUserId(userId: string): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      where: {
        warehouse: { company: { companyUsers: { some: { userId } } } },
      },
    });
    return products.map((p) => Product.fromPrisma(p));
  }

  async update(id: string, data: Partial<Product>): Promise<Product> {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { category: true },
    });
    if (!existing) {
      throw new Error(`Product with id ${id} not found`);
    }
    const prismaData: Prisma.ProductUpdateInput = {};
    if (typeof data.name !== 'undefined') prismaData.name = data.name;
    if (typeof data.sku !== 'undefined') prismaData.sku = data.sku;
    if (typeof data.barcode !== 'undefined') prismaData.barcode = data.barcode as string | null;
    if (typeof data.category !== 'undefined') prismaData.category = data.category;
    if (typeof data.type !== 'undefined') prismaData.type = data.type as string;
    if (typeof data.description !== 'undefined')
      prismaData.description = data.description as string | null;
    const finalCategory = data.category ?? existing.category;
    if (finalCategory !== ProductCategory.PESTICIDE) {
      prismaData.administrativeStatus = null;
    } else if (typeof data.administrativeStatus !== 'undefined') {
      prismaData.administrativeStatus = data.administrativeStatus as string | null;
    }
    if (typeof data.registrationNumber !== 'undefined')
      prismaData.registrationNumber = data.registrationNumber as string | null;
    if (typeof data.labelUrl !== 'undefined') prismaData.labelUrl = data.labelUrl as string | null;
    if (typeof data.labelMetadata !== 'undefined') {
      prismaData.labelMetadata =
        data.labelMetadata === null
          ? Prisma.JsonNull
          : (data.labelMetadata as Prisma.InputJsonValue);
    }
    if (typeof data.warehouseId !== 'undefined') {
      prismaData.warehouse = { connect: { id: data.warehouseId } };
    }
    if (typeof data.vintage !== 'undefined') prismaData.vintage = data.vintage as number | null;
    if (typeof data.unitPrice !== 'undefined')
      prismaData.unitPrice = data.unitPrice as number | null;
    if (typeof data.vatRate !== 'undefined') prismaData.vatRate = data.vatRate as number | null;
    if (typeof data.unitOfMeasure !== 'undefined')
      prismaData.unitOfMeasure = data.unitOfMeasure as string | null;
    if (typeof data.isActive !== 'undefined') prismaData.isActive = data.isActive as boolean;

    const updated = await this.prisma.product.update({
      where: { id },
      data: prismaData,
    });
    return Product.fromPrisma(updated);
  }

  async updateAdministrativeStatusBulk(
    updates: Array<{ id: string; administrativeStatus: string | null }>,
  ): Promise<number> {
    if (updates.length === 0) return 0;
    const ids = updates.map((u) => u.id);
    const existing = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, category: true },
    });
    const categoryById = new Map(existing.map((p) => [p.id, p.category]));
    const ops = updates
      .filter((u) => categoryById.has(u.id))
      .map((u) => {
        const isPesticide = categoryById.get(u.id) === ProductCategory.PESTICIDE;
        return this.prisma.product.update({
          where: { id: u.id },
          data: { administrativeStatus: isPesticide ? u.administrativeStatus : null },
        });
      });
    if (ops.length === 0) return 0;
    await this.prisma.$transaction(ops);
    return ops.length;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.stock.deleteMany({
        where: { productId: id },
      });
      await tx.product.delete({ where: { id } });
    });
  }

  async deleteMany(ids: string[], companyId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      let productIdsToDelete = ids;

      if (companyId) {
        const products = await tx.product.findMany({
          where: {
            id: { in: ids },
            warehouse: { companyId },
          },
          select: { id: true },
        });
        productIdsToDelete = products.map((p) => p.id);
      }

      if (productIdsToDelete.length === 0) return;

      await tx.stock.deleteMany({
        where: {
          productId: { in: productIdsToDelete },
        },
      });

      await tx.product.deleteMany({
        where: {
          id: { in: productIdsToDelete },
        },
      });
    });
  }
}
