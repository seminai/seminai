import { z } from 'zod';
import { FieldNoteCategory, PrismaClient } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { Stock } from '../../../domain/entities/Stock';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { calculateAggregatedStock } from '../agents/dosage_agent/stockAggregator';
import {
  assertCompanyAccess,
  assertFieldAccess,
  assertProductionUnitAccess,
} from '../agents/shared/authorization';

export const SaveStockOutTreatmentSchema = z.object({
  companyId: z.string().optional().describe("ID dell'azienda (opzionale, verificato se fornito)"),
  productId: z
    .string()
    .describe('ID del prodotto applicato/usato nel trattamento (deve esistere in magazzino)'),
  fieldId: z.string().describe('ID del campo su cui e stato eseguito il trattamento'),
  productionUnitId: z
    .string()
    .describe("ID dell'unita produttiva su cui e stato eseguito il trattamento"),
  quantity: z.number().positive().describe('Quantita di prodotto consumata'),
  unitOfMeasureQuantity: z.string().describe('Unita di misura della quantita (kg, L, ml, g)'),
  rawContent: z.string().describe("Testo originale dell'utente"),
  operationDate: z.string().optional().describe('Data del trattamento (ISO 8601)'),
  treatedAreaHa: z
    .number()
    .positive()
    .optional()
    .describe("Area effettivamente trattata in ettari, se diversa dall'area totale"),
  notes: z.string().optional().describe('Note aggiuntive'),
});

export type SaveStockOutTreatmentInput = z.infer<typeof SaveStockOutTreatmentSchema>;

export interface SaveStockOutTreatmentResult {
  success: boolean;
  fieldNoteId: string;
  stockId: string;
  productId: string;
  productName: string;
  availableStockBefore: number;
  availableStockAfter: number;
  insufficientStock: boolean;
  message: string;
}

export async function saveStockOutTreatment(
  userId: string,
  prisma: PrismaClient,
  input: SaveStockOutTreatmentInput,
): Promise<SaveStockOutTreatmentResult> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { warehouse: true },
  });

  if (!product) {
    throw new Error(`Prodotto con ID ${input.productId} non trovato`);
  }

  const field = await prisma.field.findUnique({
    where: { id: input.fieldId },
    select: { id: true, name: true, companyId: true },
  });

  if (!field?.companyId) {
    throw new Error('Campo non trovato o senza azienda associata');
  }

  const resolvedCompanyId = product.warehouse.companyId;

  if (input.companyId && input.companyId !== resolvedCompanyId) {
    throw new Error(
      `Conflitto companyId: input=${input.companyId}, prodotto=${resolvedCompanyId}. Disambiguare prima di salvare.`,
    );
  }

  if (field.companyId !== resolvedCompanyId) {
    throw new Error(
      `Conflitto azienda: il prodotto appartiene a un'azienda diversa dal campo selezionato.`,
    );
  }

  const productionUnitOnField = await prisma.productionUnitOnField.findUnique({
    where: {
      productionUnitId_fieldId: {
        productionUnitId: input.productionUnitId,
        fieldId: input.fieldId,
      },
    },
    select: { productionUnitId: true },
  });

  if (!productionUnitOnField) {
    throw new Error("L'unita produttiva selezionata non appartiene al campo indicato");
  }

  await assertCompanyAccess(userId, resolvedCompanyId);
  await assertFieldAccess(userId, input.fieldId);
  await assertProductionUnitAccess(userId, input.productionUnitId);

  const aggregated = await calculateAggregatedStock(prisma, {
    productId: input.productId,
    companyId: resolvedCompanyId,
  });

  const availableStockBefore = aggregated.availableStock;
  const insufficientStock = availableStockBefore < input.quantity;
  const availableStockAfter = availableStockBefore - input.quantity;

  const stockRepo = new PrismaStockRepository(prisma);
  const stock = Stock.create({
    productId: input.productId,
    quantity: -Math.abs(input.quantity),
    unitOfMeasureQuantity: input.unitOfMeasureQuantity,
    price: 0,
    unitOfMeasurePrice: 'EUR',
    type: 'OUT',
    notes: input.notes ?? 'Scarico magazzino da trattamento registrato da nota di campo',
  });

  const createdStock = await stockRepo.create(stock);

  const fieldNoteRepo = new PrismaFieldNoteRepository(prisma);
  const createUseCase = new CreateFieldNoteUseCase(fieldNoteRepo);
  const updateUseCase = new UpdateFieldNoteUseCase(fieldNoteRepo);

  const operationDate = input.operationDate ? new Date(input.operationDate) : new Date();
  const stockOperation = 'TREATMENT_OUT';

  const fieldNote = await createUseCase.execute(userId, {
    category: FieldNoteCategory.OPERATION,
    rawContent: input.rawContent,
    operationDate,
    metadata: {
      source: 'field_note_agent',
      aiProcessed: true,
      stockOperation,
    },
  });

  await updateUseCase.execute(fieldNote.id, userId, {
    status: 'PROCESSED',
    extractedData: {
      stockOperation,
      operation: 'trattamento',
      productName: product.name,
      productId: input.productId,
      fieldId: input.fieldId,
      productionUnitId: input.productionUnitId,
      stockId: createdStock.id,
      quantity: input.quantity,
      unit: input.unitOfMeasureQuantity,
      treatedAreaHa: input.treatedAreaHa,
      availableStockBefore,
      availableStockAfter,
      insufficientStock,
      recognizedProducts: [
        {
          name: product.name,
          quantity: input.quantity,
          unit: input.unitOfMeasureQuantity,
          productId: input.productId,
        },
      ],
      recognizedFields: [
        {
          name: field.name,
          fieldId: input.fieldId,
        },
      ],
    },
    fieldId: input.fieldId,
    productionUnitId: input.productionUnitId,
    productId: input.productId,
    notes: input.notes,
  });

  let message = `Trattamento registrato: scaricati ${input.quantity} ${input.unitOfMeasureQuantity} di ${product.name}`;
  if (insufficientStock) {
    message += ` (ATTENZIONE: disponibilita insufficiente. Disponibili prima del trattamento: ${availableStockBefore} ${input.unitOfMeasureQuantity})`;
  }

  return {
    success: true,
    fieldNoteId: fieldNote.id,
    stockId: createdStock.id,
    productId: input.productId,
    productName: product.name,
    availableStockBefore,
    availableStockAfter,
    insufficientStock,
    message,
  };
}
