import { Prisma, PrismaClient } from '@prisma/client';
import type {
  DeleteFilesBulkCascade,
  DeleteFilesBulkDTO,
  DeleteFilesBulkResult,
} from '../../domain/dtos/delete-files-bulk.dto';
import type { IArchiveDeletionRepository } from '../../domain/repositories/IArchiveDeletionRepository';

/**
 * Prisma implementation for archive bulk deletion cascades.
 */
export class PrismaArchiveDeletionRepository implements IArchiveDeletionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async deleteBulk(dto: DeleteFilesBulkDTO): Promise<DeleteFilesBulkResult> {
    return this.prisma.$transaction(async (tx) => this.deleteBulkInTransaction(tx, dto));
  }

  private async deleteBulkInTransaction(
    tx: Prisma.TransactionClient,
    dto: DeleteFilesBulkDTO,
  ): Promise<DeleteFilesBulkResult> {
    const fileIds = [...dto.ids];
    const extractionIds = (dto.extractionIds ?? []).filter((id) => id.length > 0);
    const cascade = dto.cascade ?? {};
    const fieldIds = cascade.fields ? await this.findFieldIds(tx, dto.companyId) : [];
    const productionUnitIds = cascade.productionUnits
      ? await this.findProductionUnitIds(tx, dto.companyId)
      : [];
    const productIds = cascade.productsAll ? await this.findProductIds(tx, dto.companyId) : [];
    const jobIds = await this.findJobIds(tx, productionUnitIds);
    const fieldNoteIds = await this.findFieldNoteIds(tx, dto.companyId, cascade);
    const deletedFieldNotes = await this.deleteFieldNotes(tx, fieldNoteIds);
    const deletedStocksBySource = await this.deleteStocksBySourceFiles(tx, fileIds);
    const deletedStocksByCompany = await this.deleteCompanyStocks(tx, {
      companyId: dto.companyId,
      productIds,
      jobIds,
      stocksAll: Boolean(cascade.stocksAll),
      productsAll: Boolean(cascade.productsAll),
    });
    const deletedProducts = await this.deleteProducts(tx, productIds);
    const deletedProductionUnits = await this.deleteProductionUnits(tx, productionUnitIds);
    const deletedFields = await this.deleteFields(tx, fieldIds);
    const deletedExtractions = await this.deleteExtractions(tx, fileIds, extractionIds);
    const deletedFiles = await this.deleteFiles(tx, fileIds);
    return {
      deletedFiles,
      deletedExtractions,
      deletedStocksBySource,
      deletedStocksByCompany,
      deletedFields,
      deletedProductionUnits,
      deletedProducts,
      deletedFieldNotes,
    };
  }

  private async findFieldIds(tx: Prisma.TransactionClient, companyId: string): Promise<string[]> {
    const fields = await tx.field.findMany({ where: { companyId }, select: { id: true } });
    return fields.map((field) => field.id);
  }

  private async findProductionUnitIds(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string[]> {
    const units = await tx.productionUnit.findMany({
      where: { productionUnitsOnFields: { some: { field: { companyId } } } },
      select: { id: true },
    });
    return units.map((unit) => unit.id);
  }

  private async findProductIds(tx: Prisma.TransactionClient, companyId: string): Promise<string[]> {
    const products = await tx.product.findMany({
      where: { warehouse: { companyId } },
      select: { id: true },
    });
    return products.map((product) => product.id);
  }

  private async findJobIds(
    tx: Prisma.TransactionClient,
    productionUnitIds: readonly string[],
  ): Promise<string[]> {
    if (productionUnitIds.length === 0) return [];
    const jobs = await tx.job.findMany({
      where: { productionUnitId: { in: [...productionUnitIds] } },
      select: { id: true },
    });
    return jobs.map((job) => job.id);
  }

  private async findFieldNoteIds(
    tx: Prisma.TransactionClient,
    companyId: string,
    cascade: DeleteFilesBulkCascade,
  ): Promise<string[]> {
    const where = buildFieldNoteWhere(companyId, cascade);
    if (!where) return [];
    const notes = await tx.fieldNote.findMany({ where, select: { id: true } });
    return notes.map((note) => note.id);
  }

  private async deleteFieldNotes(
    tx: Prisma.TransactionClient,
    fieldNoteIds: readonly string[],
  ): Promise<number> {
    if (fieldNoteIds.length === 0) return 0;
    await tx.fieldNoteAttachment.deleteMany({ where: { fieldNoteId: { in: [...fieldNoteIds] } } });
    const result = await tx.fieldNote.deleteMany({ where: { id: { in: [...fieldNoteIds] } } });
    return result.count;
  }

  private async deleteStocksBySourceFiles(
    tx: Prisma.TransactionClient,
    fileIds: readonly string[],
  ): Promise<number> {
    if (fileIds.length === 0) return 0;
    const result = await tx.stock.deleteMany({ where: { sourceFileId: { in: [...fileIds] } } });
    return result.count;
  }

  private async deleteCompanyStocks(
    tx: Prisma.TransactionClient,
    input: {
      readonly companyId: string;
      readonly productIds: readonly string[];
      readonly jobIds: readonly string[];
      readonly stocksAll: boolean;
      readonly productsAll: boolean;
    },
  ): Promise<number> {
    const productWhere = input.productsAll
      ? { productId: { in: [...input.productIds] } }
      : { product: { warehouse: { companyId: input.companyId } } };
    const productResult =
      input.stocksAll || input.productsAll
        ? await tx.stock.deleteMany({ where: productWhere })
        : { count: 0 };
    const jobResult = input.jobIds.length
      ? await tx.stock.deleteMany({ where: { jobId: { in: [...input.jobIds] } } })
      : { count: 0 };
    return productResult.count + jobResult.count;
  }

  private async deleteProducts(
    tx: Prisma.TransactionClient,
    productIds: readonly string[],
  ): Promise<number> {
    if (productIds.length === 0) return 0;
    const result = await tx.product.deleteMany({ where: { id: { in: [...productIds] } } });
    return result.count;
  }

  private async deleteProductionUnits(
    tx: Prisma.TransactionClient,
    productionUnitIds: readonly string[],
  ): Promise<number> {
    if (productionUnitIds.length === 0) return 0;
    await tx.job.deleteMany({ where: { productionUnitId: { in: [...productionUnitIds] } } });
    await tx.productionCycle.deleteMany({
      where: { productionUnitId: { in: [...productionUnitIds] } },
    });
    await tx.productionUnitOnField.deleteMany({
      where: { productionUnitId: { in: [...productionUnitIds] } },
    });
    const result = await tx.productionUnit.deleteMany({
      where: { id: { in: [...productionUnitIds] } },
    });
    return result.count;
  }

  private async deleteFields(
    tx: Prisma.TransactionClient,
    fieldIds: readonly string[],
  ): Promise<number> {
    if (fieldIds.length === 0) return 0;
    await tx.productionUnitOnField.deleteMany({ where: { fieldId: { in: [...fieldIds] } } });
    const result = await tx.field.deleteMany({ where: { id: { in: [...fieldIds] } } });
    return result.count;
  }

  private async deleteExtractions(
    tx: Prisma.TransactionClient,
    fileIds: readonly string[],
    extractionIds: readonly string[],
  ): Promise<number> {
    const byFile = fileIds.length
      ? await tx.fileExtraction.deleteMany({ where: { fileId: { in: [...fileIds] } } })
      : { count: 0 };
    const explicit = extractionIds.length
      ? await tx.fileExtraction.deleteMany({ where: { id: { in: [...extractionIds] } } })
      : { count: 0 };
    return byFile.count + explicit.count;
  }

  private async deleteFiles(
    tx: Prisma.TransactionClient,
    fileIds: readonly string[],
  ): Promise<number> {
    if (fileIds.length === 0) return 0;
    await tx.field.updateMany({
      where: { sourceFileId: { in: [...fileIds] } },
      data: { sourceFileId: null },
    });
    await tx.emailAttachment.updateMany({
      where: { fileId: { in: [...fileIds] } },
      data: { fileId: null },
    });
    const result = await tx.file.deleteMany({ where: { id: { in: [...fileIds] } } });
    return result.count;
  }
}

function buildFieldNoteWhere(
  companyId: string,
  cascade: DeleteFilesBulkCascade,
): Prisma.FieldNoteWhereInput | null {
  const filters: Prisma.FieldNoteWhereInput[] = [];
  if (cascade.fieldNotes || cascade.fields) filters.push({ field: { companyId } });
  if (cascade.fieldNotes || cascade.productionUnits) {
    filters.push({
      productionUnit: { productionUnitsOnFields: { some: { field: { companyId } } } },
    });
    filters.push({
      job: { productionUnit: { productionUnitsOnFields: { some: { field: { companyId } } } } },
    });
  }
  if (cascade.fieldNotes || cascade.productsAll)
    filters.push({ product: { warehouse: { companyId } } });
  return filters.length > 0 ? { OR: filters } : null;
}
