import { Prisma, PrismaClient } from '@prisma/client';

interface ConformityNotesContext {
  fieldId?: string | null;
  productionUnitId?: string | null;
  products: Array<{
    name: string;
    productId?: string | null;
  }>;
}

interface AreaInfo {
  fieldAreaHa: number | null;
  productionUnitAreaHa: number | null;
}

interface ConformityNote {
  productId: string | null;
  productName: string;
  registrationNumber: string;
  labelId: string;
  labelProductName: string;
  labelSourceUrl: string;
  labelCategory: string;
  fieldId: string | null;
  productionUnitId: string | null;
  fieldAreaHa: number | null;
  productionUnitAreaHa: number | null;
  alert: string;
  checkedAt: string;
}

/**
 * Service to build conformity notes for field notes.
 */
export class ConformityNotesService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Builds conformity notes based on product mentions and label presence.
   */
  public async buildConformityNotes(
    context: ConformityNotesContext,
  ): Promise<Prisma.JsonValue | null> {
    console.log('[CONFORMITY-NOTES] Starting check', {
      productsCount: context.products.length,
      fieldId: context.fieldId,
      productionUnitId: context.productionUnitId,
    });
    if (context.products.length === 0) {
      console.log('[CONFORMITY-NOTES] No products to check');
      return null;
    }
    if (!context.fieldId && !context.productionUnitId) {
      console.log('[CONFORMITY-NOTES] No fieldId or productionUnitId provided');
      return null;
    }
    const areaInfo = await this.resolveAreaInfo(context.fieldId, context.productionUnitId);
    console.log('[CONFORMITY-NOTES] Area info resolved', areaInfo);
    const notes = await this.buildNotes(context, areaInfo);
    console.log('[CONFORMITY-NOTES] Built notes', { count: notes.length });
    if (notes.length === 0) {
      return null;
    }
    return notes as unknown as Prisma.JsonValue;
  }

  private async buildNotes(
    context: ConformityNotesContext,
    areaInfo: AreaInfo,
  ): Promise<ConformityNote[]> {
    const notes: ConformityNote[] = [];
    for (const product of context.products) {
      console.log('[CONFORMITY-NOTES] Checking product', {
        name: product.name,
        productId: product.productId,
      });
      const productInfo = await this.resolveProductInfo(product);
      if (!productInfo) {
        console.log('[CONFORMITY-NOTES] Product not found in database');
        continue;
      }
      console.log('[CONFORMITY-NOTES] Product resolved', {
        id: productInfo.id,
        name: productInfo.name,
        hasRegistrationNumber: !!productInfo.registrationNumber,
      });
      if (!productInfo.registrationNumber) {
        console.log('[CONFORMITY-NOTES] Product has no registrationNumber, skipping');
        continue;
      }
      const labelMatch = await this.findLabelMatch(
        productInfo.name,
        productInfo.registrationNumber,
      );
      if (!labelMatch) {
        console.log('[CONFORMITY-NOTES] No label found for', {
          productName: productInfo.name,
          registrationNumber: productInfo.registrationNumber,
        });
        continue;
      }
      console.log('[CONFORMITY-NOTES] Label found!', {
        labelId: labelMatch.id,
        labelProductName: labelMatch.productName,
      });
      notes.push(
        this.buildNote({
          productId: productInfo.id,
          productName: productInfo.name,
          registrationNumber: productInfo.registrationNumber,
          labelMatch,
          context,
          areaInfo,
        }),
      );
    }
    return notes;
  }

  private async resolveAreaInfo(
    fieldId: string | null | undefined,
    productionUnitId: string | null | undefined,
  ): Promise<AreaInfo> {
    const [field, productionUnit] = await Promise.all([
      fieldId
        ? this.prisma.field.findUnique({
            where: { id: fieldId },
            select: { sauHa: true, gisHa: true },
          })
        : Promise.resolve(null),
      productionUnitId
        ? this.prisma.productionUnit.findUnique({
            where: { id: productionUnitId },
            select: { areaHa: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      fieldAreaHa: field?.sauHa ?? field?.gisHa ?? null,
      productionUnitAreaHa: productionUnit?.areaHa ?? null,
    };
  }

  private async resolveProductInfo(product: {
    name: string;
    productId?: string | null;
  }): Promise<{ id: string; name: string; registrationNumber: string | null } | null> {
    if (!product.productId && product.name.trim().length === 0) {
      return null;
    }
    const productRecord = product.productId
      ? await this.prisma.product.findUnique({
          where: { id: product.productId },
          select: { id: true, name: true, registrationNumber: true },
        })
      : await this.prisma.product.findFirst({
          where: {
            name: {
              contains: product.name.trim(),
              mode: 'insensitive',
            },
          },
          select: { id: true, name: true, registrationNumber: true },
        });
    if (!productRecord) {
      return null;
    }
    const resolvedName = productRecord.name || product.name;
    return {
      id: productRecord.id,
      name: resolvedName,
      registrationNumber: productRecord.registrationNumber ?? null,
    };
  }

  private async findLabelMatch(
    productName: string,
    registrationNumber: string,
  ): Promise<{
    id: string;
    productName: string;
    registrationNumber: string;
    sourceUrl: string;
    category: string;
  } | null> {
    if (!productName.trim()) {
      return null;
    }
    const label = await this.prisma.labelExtraction.findFirst({
      where: {
        isArchived: false,
        registrationNumber,
        productName: {
          contains: productName.trim(),
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        productName: true,
        registrationNumber: true,
        sourceUrl: true,
        category: true,
      },
    });
    if (!label) {
      return null;
    }
    return {
      id: label.id,
      productName: label.productName,
      registrationNumber: label.registrationNumber,
      sourceUrl: label.sourceUrl,
      category: label.category,
    };
  }

  private buildNote(params: {
    productId: string;
    productName: string;
    registrationNumber: string;
    labelMatch: {
      id: string;
      productName: string;
      registrationNumber: string;
      sourceUrl: string;
      category: string;
    };
    context: ConformityNotesContext;
    areaInfo: AreaInfo;
  }): ConformityNote {
    return {
      productId: params.productId,
      productName: params.productName,
      registrationNumber: params.registrationNumber,
      labelId: params.labelMatch.id,
      labelProductName: params.labelMatch.productName,
      labelSourceUrl: params.labelMatch.sourceUrl,
      labelCategory: params.labelMatch.category,
      fieldId: params.context.fieldId ?? null,
      productionUnitId: params.context.productionUnitId ?? null,
      fieldAreaHa: params.areaInfo.fieldAreaHa,
      productionUnitAreaHa: params.areaInfo.productionUnitAreaHa,
      alert: 'Label found in database with matching registration number.',
      checkedAt: new Date().toISOString(),
    };
  }
}
