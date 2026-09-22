import type { Prisma, PrismaClient } from '@prisma/client';

interface DeleteContext {
  readonly companyId: string;
  readonly fileIds: readonly string[];
  readonly extractionIds: readonly string[];
  readonly warehouseIds: readonly string[];
  readonly productIds: readonly string[];
  readonly fieldIds: readonly string[];
  readonly productionUnitIds: readonly string[];
  readonly machineIds: readonly string[];
  readonly jobIds: readonly string[];
  readonly fieldNoteIds: readonly string[];
  readonly emailIngestionIds: readonly string[];
}

/**
 * Deletes a company and all data that cannot survive without it.
 */
export async function deleteCompanyWithAllData(
  prisma: PrismaClient,
  companyId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const context = await collectDeleteContext(tx, companyId);
    await deleteDependents(tx, context);
    await tx.company.delete({ where: { id: companyId } });
  });
}

async function collectDeleteContext(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<DeleteContext> {
  const fileIds = await findIds(tx.file.findMany({ where: { companyId }, select: { id: true } }));
  const extractionIds = await findIds(
    tx.fileExtraction.findMany({ where: { companyId }, select: { id: true } }),
  );
  const warehouseIds = await findIds(
    tx.warehouse.findMany({ where: { companyId }, select: { id: true } }),
  );
  const productIds = warehouseIds.length
    ? await findIds(
        tx.product.findMany({
          where: { warehouseId: { in: [...warehouseIds] } },
          select: { id: true },
        }),
      )
    : [];
  const fieldIds = await findIds(tx.field.findMany({ where: { companyId }, select: { id: true } }));
  const productionUnitIds = fieldIds.length ? await findProductionUnitIds(tx, fieldIds) : [];
  const machineIds = await findIds(
    tx.machine.findMany({ where: { companyId }, select: { id: true } }),
  );
  const jobIds = await findJobIds(tx, productionUnitIds, machineIds);
  const fieldNoteIds = await findFieldNoteIds(tx, {
    fieldIds,
    productionUnitIds,
    productIds,
    jobIds,
  });
  const emailIngestionIds = await findIds(
    tx.emailIngestion.findMany({ where: { companyId }, select: { id: true } }),
  );
  return {
    companyId,
    fileIds,
    extractionIds,
    warehouseIds,
    productIds,
    fieldIds,
    productionUnitIds,
    machineIds,
    jobIds,
    fieldNoteIds,
    emailIngestionIds,
  };
}

async function deleteDependents(
  tx: Prisma.TransactionClient,
  context: DeleteContext,
): Promise<void> {
  await deleteFieldNotes(tx, context.fieldNoteIds);
  await deleteStocks(tx, context);
  await deleteFileExtractions(tx, context.extractionIds);
  await deleteEmailData(tx, context);
  await tx.job.deleteMany({ where: { id: { in: [...context.jobIds] } } });
  await tx.productionCycle.deleteMany({
    where: { productionUnitId: { in: [...context.productionUnitIds] } },
  });
  await tx.productionUnitOnField.deleteMany({
    where: {
      OR: [
        { fieldId: { in: [...context.fieldIds] } },
        { productionUnitId: { in: [...context.productionUnitIds] } },
      ],
    },
  });
  await tx.productionUnit.deleteMany({ where: { id: { in: [...context.productionUnitIds] } } });
  await tx.product.deleteMany({ where: { id: { in: [...context.productIds] } } });
  await tx.warehouse.deleteMany({ where: { id: { in: [...context.warehouseIds] } } });
  await tx.field.deleteMany({ where: { id: { in: [...context.fieldIds] } } });
  await tx.machine.deleteMany({ where: { id: { in: [...context.machineIds] } } });
  await tx.file.deleteMany({ where: { id: { in: [...context.fileIds] } } });
  await deleteDirectCompanyRows(tx, context);
}

async function deleteDirectCompanyRows(
  tx: Prisma.TransactionClient,
  context: DeleteContext,
): Promise<void> {
  await tx.notification.deleteMany({ where: { companyId: context.companyId } });
  await tx.llmUsage.deleteMany({ where: { companyId: context.companyId } });
  await tx.userOnCompany.deleteMany({ where: { companyId: context.companyId } });
  await tx.ruleOnCompany.deleteMany({ where: { companyId: context.companyId } });
}

async function deleteFieldNotes(
  tx: Prisma.TransactionClient,
  fieldNoteIds: readonly string[],
): Promise<void> {
  if (fieldNoteIds.length === 0) return;
  await tx.fieldNoteAttachment.deleteMany({ where: { fieldNoteId: { in: [...fieldNoteIds] } } });
  await tx.fieldNote.deleteMany({ where: { id: { in: [...fieldNoteIds] } } });
}

async function deleteStocks(tx: Prisma.TransactionClient, context: DeleteContext): Promise<void> {
  await tx.stock.deleteMany({
    where: {
      OR: [
        { jobId: { in: [...context.jobIds] } },
        { productId: { in: [...context.productIds] } },
        { sourceFileId: { in: [...context.fileIds] } },
      ],
    },
  });
}

async function deleteFileExtractions(
  tx: Prisma.TransactionClient,
  extractionIds: readonly string[],
): Promise<void> {
  if (extractionIds.length === 0) return;
  await tx.fileExtractionEditLog.deleteMany({
    where: { extractionId: { in: [...extractionIds] } },
  });
  await tx.fileExtraction.deleteMany({ where: { id: { in: [...extractionIds] } } });
}

async function deleteEmailData(
  tx: Prisma.TransactionClient,
  context: DeleteContext,
): Promise<void> {
  if (context.fileIds.length) {
    await tx.emailAttachment.updateMany({
      where: { fileId: { in: [...context.fileIds] } },
      data: { fileId: null },
    });
  }
  if (context.emailIngestionIds.length === 0) return;
  await tx.emailIngestion.updateMany({
    where: { parentIngestionId: { in: [...context.emailIngestionIds] } },
    data: { parentIngestionId: null },
  });
  await tx.emailAttachment.deleteMany({
    where: { ingestionId: { in: [...context.emailIngestionIds] } },
  });
  await tx.emailIngestion.deleteMany({ where: { id: { in: [...context.emailIngestionIds] } } });
}

async function findProductionUnitIds(
  tx: Prisma.TransactionClient,
  fieldIds: readonly string[],
): Promise<string[]> {
  const links = await tx.productionUnitOnField.findMany({
    where: { fieldId: { in: [...fieldIds] } },
    select: { productionUnitId: true },
    distinct: ['productionUnitId'],
  });
  return links.map((link) => link.productionUnitId);
}

async function findJobIds(
  tx: Prisma.TransactionClient,
  productionUnitIds: readonly string[],
  machineIds: readonly string[],
): Promise<string[]> {
  if (productionUnitIds.length === 0 && machineIds.length === 0) return [];
  const jobs = await tx.job.findMany({
    where: {
      OR: [
        { productionUnitId: { in: [...productionUnitIds] } },
        { machineId: { in: [...machineIds] } },
      ],
    },
    select: { id: true },
  });
  return jobs.map((job) => job.id);
}

async function findFieldNoteIds(
  tx: Prisma.TransactionClient,
  input: {
    readonly fieldIds: readonly string[];
    readonly productionUnitIds: readonly string[];
    readonly productIds: readonly string[];
    readonly jobIds: readonly string[];
  },
): Promise<string[]> {
  const notes = await tx.fieldNote.findMany({
    where: {
      OR: [
        { fieldId: { in: [...input.fieldIds] } },
        { productionUnitId: { in: [...input.productionUnitIds] } },
        { productId: { in: [...input.productIds] } },
        { jobId: { in: [...input.jobIds] } },
      ],
    },
    select: { id: true },
  });
  return notes.map((note) => note.id);
}

async function findIds<T extends { readonly id: string }>(
  promise: Promise<T[]>,
): Promise<string[]> {
  const rows = await promise;
  return rows.map((row) => row.id);
}
