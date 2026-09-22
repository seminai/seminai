import { z } from 'zod';
import { PrismaClient, FieldNoteCategory, ProductCategory } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { Stock } from '../../../domain/entities/Stock';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import {
  assertCompanyAccess,
  assertFieldAccess,
  assertProductionUnitAccess,
} from '../agents/shared/authorization';

export const SaveStockInHarvestSchema = z.object({
  companyId: z.string().describe("ID dell'azienda"),
  warehouseId: z.string().optional().describe('ID del magazzino (opzionale, auto-risolto)'),
  fieldId: z.string().optional().describe('ID del campo raccolto'),
  productionUnitId: z.string().optional().describe("ID dell'unità produttiva raccolta"),
  cropName: z.string().describe("Nome della coltura raccolta (es. 'frumento tenero', 'mais')"),
  quantity: z.number().positive().describe('Quantità raccolta'),
  unitOfMeasureQuantity: z.string().describe('Unità di misura (t, q, kg)'),
  rawContent: z.string().describe("Testo originale dell'utente"),
  operationDate: z.string().optional().describe('Data della raccolta (ISO 8601)'),
  notes: z.string().optional().describe('Note aggiuntive'),
});

export type SaveStockInHarvestInput = z.infer<typeof SaveStockInHarvestSchema>;

export interface SaveStockInHarvestResult {
  success: boolean;
  fieldNoteId: string;
  stockId: string;
  productId: string;
  cropName: string;
  isNewProduct: boolean;
  message: string;
}

export async function saveStockInHarvest(
  userId: string,
  prisma: PrismaClient,
  input: SaveStockInHarvestInput,
): Promise<SaveStockInHarvestResult> {
  await assertCompanyAccess(userId, input.companyId);
  if (input.fieldId) {
    await assertFieldAccess(userId, input.fieldId);
  }
  if (input.productionUnitId) {
    await assertProductionUnitAccess(userId, input.productionUnitId);
  }
  const warehouseId = await resolveWarehouseForCompany(prisma, input.companyId, input.warehouseId);

  // Find or create HARVEST product
  let productId: string;
  let isNewProduct = false;

  const existingProduct = await prisma.product.findFirst({
    where: {
      warehouseId,
      category: ProductCategory.HARVEST,
      name: { equals: input.cropName.trim(), mode: 'insensitive' },
    },
  });

  if (existingProduct) {
    productId = existingProduct.id;
  } else {
    const created = await prisma.product.create({
      data: {
        name: input.cropName.trim(),
        sku: 'HARVEST',
        category: ProductCategory.HARVEST,
        type: 'Raccolto',
        warehouseId,
      },
    });
    productId = created.id;
    isNewProduct = true;
  }

  // Create Stock IN movement
  const stockRepo = new PrismaStockRepository(prisma);

  const stock = Stock.create({
    productId,
    quantity: input.quantity,
    unitOfMeasureQuantity: input.unitOfMeasureQuantity,
    price: 0,
    unitOfMeasurePrice: '',
    type: 'IN',
  });

  const createdStock = await stockRepo.create(stock);

  // Create FieldNote with PROCESSED status
  const fieldNoteRepo = new PrismaFieldNoteRepository(prisma);
  const createUseCase = new CreateFieldNoteUseCase(fieldNoteRepo);
  const updateUseCase = new UpdateFieldNoteUseCase(fieldNoteRepo);

  const operationDate = input.operationDate ? new Date(input.operationDate) : new Date();

  const fieldNote = await createUseCase.execute(userId, {
    category: FieldNoteCategory.HARVEST,
    rawContent: input.rawContent,
    operationDate,
    metadata: {
      source: 'field_note_agent',
      aiProcessed: true,
      stockOperation: 'HARVEST_IN',
    },
  });

  await updateUseCase.execute(fieldNote.id, userId, {
    status: 'PROCESSED',
    extractedData: {
      stockOperation: 'HARVEST_IN',
      cropName: input.cropName,
      productId,
      stockId: createdStock.id,
      quantity: input.quantity,
      unit: input.unitOfMeasureQuantity,
      fieldId: input.fieldId,
      productionUnitId: input.productionUnitId,
      isNewProduct,
    },
    fieldId: input.fieldId || null,
    productionUnitId: input.productionUnitId || null,
    productId,
    notes: input.notes,
  });

  return {
    success: true,
    fieldNoteId: fieldNote.id,
    stockId: createdStock.id,
    productId,
    cropName: input.cropName,
    isNewProduct,
    message: `Raccolta registrata: ${input.quantity} ${input.unitOfMeasureQuantity} di ${input.cropName}${isNewProduct ? ' (nuovo prodotto creato)' : ''}`,
  };
}

async function resolveWarehouseForCompany(
  prisma: PrismaClient,
  companyId: string,
  warehouseId?: string,
): Promise<string> {
  if (warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new Error('Magazzino non trovato');
    if (wh.companyId !== companyId)
      throw new Error("Il magazzino non appartiene all'azienda specificata");
    return warehouseId;
  }

  const warehouses = await prisma.warehouse.findMany({ where: { companyId } });
  if (warehouses.length > 0) return warehouses[0].id;

  const created = await prisma.warehouse.create({
    data: {
      companyId,
      name: 'Magazzino Principale',
      address: 'N/A',
      sezione: 'N/A',
      foglio: 'N/A',
      particella: 'N/A',
    },
  });
  return created.id;
}
