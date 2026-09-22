import { z } from 'zod';
import { PrismaClient, FieldNoteCategory } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { Stock } from '../../../domain/entities/Stock';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { calculateAggregatedStock } from '../agents/dosage_agent/stockAggregator';
import { assertCompanyAccess } from '../agents/shared/authorization';

export const SaveStockOutSaleSchema = z.object({
  companyId: z
    .string()
    .optional()
    .describe("ID dell'azienda (opzionale, auto-risolto dal prodotto)"),
  warehouseId: z.string().optional().describe('ID del magazzino (opzionale)'),
  productId: z.string().describe('ID del prodotto da vendere (deve esistere in magazzino)'),
  quantity: z.number().positive().describe('Quantità venduta'),
  unitOfMeasureQuantity: z.string().describe('Unità di misura (t, q, kg)'),
  pricePerUnit: z.number().optional().describe('Prezzo per unità'),
  unitOfMeasurePrice: z.string().optional().describe('Unità di misura prezzo (EUR/q, EUR/t)'),
  buyerName: z.string().optional().describe("Nome dell'acquirente/consorzio"),
  documentCode: z.string().optional().describe('Codice DDT o fattura vendita'),
  documentDate: z.string().optional().describe('Data del documento (ISO 8601)'),
  documentDueDate: z.string().optional().describe('Data scadenza fattura vendita (ISO 8601)'),
  documentUrl: z.string().optional().describe('URL del file allegato'),
  rawContent: z.string().describe("Testo originale dell'utente"),
  operationDate: z.string().optional().describe('Data della vendita (ISO 8601)'),
  notes: z.string().optional().describe('Note aggiuntive'),
});

export type SaveStockOutSaleInput = z.infer<typeof SaveStockOutSaleSchema>;

export interface SaveStockOutSaleResult {
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

export async function saveStockOutSale(
  userId: string,
  prisma: PrismaClient,
  input: SaveStockOutSaleInput,
): Promise<SaveStockOutSaleResult> {
  // Verify product exists and resolve company from its warehouse
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { warehouse: true },
  });

  if (!product) {
    throw new Error(`Prodotto con ID ${input.productId} non trovato`);
  }

  // Auto-resolve companyId from the product's warehouse
  const resolvedCompanyId = product.warehouse.companyId;

  if (input.companyId && input.companyId !== resolvedCompanyId) {
    console.warn(
      `[saveStockOutSale] companyId mismatch: input=${input.companyId}, product warehouse=${resolvedCompanyId}. Using product's warehouse company.`,
    );
  }

  // Authorization gate: prevent ownership leak via arbitrary productId.
  // resolvedCompanyId comes from product.warehouse, so a forged productId
  // pointing at another tenant must be rejected here.
  await assertCompanyAccess(userId, resolvedCompanyId);

  // Calculate available stock
  const aggregated = await calculateAggregatedStock(prisma, {
    productId: input.productId,
    companyId: resolvedCompanyId,
  });

  const availableStockBefore = aggregated.availableStock;
  const insufficientStock = availableStockBefore < input.quantity;

  // Create Stock OUT movement (negative quantity)
  const stockRepo = new PrismaStockRepository(prisma);
  const docDate = input.documentDate ? new Date(input.documentDate) : null;

  const stock = Stock.create({
    productId: input.productId,
    quantity: -Math.abs(input.quantity),
    unitOfMeasureQuantity: input.unitOfMeasureQuantity,
    price: input.pricePerUnit ?? 0,
    unitOfMeasurePrice: input.unitOfMeasurePrice ?? 'EUR',
    type: 'OUT',
    ddtCode: input.documentCode ?? null,
    ddtDate: docDate,
    invoiceDueDate: input.documentDueDate ? new Date(input.documentDueDate) : null,
    ddtUrlFile: input.documentUrl ?? null,
    companySupplierName: input.buyerName ?? null,
  });

  const createdStock = await stockRepo.create(stock);

  const availableStockAfter = availableStockBefore - input.quantity;

  // Create FieldNote with PROCESSED status
  const fieldNoteRepo = new PrismaFieldNoteRepository(prisma);
  const createUseCase = new CreateFieldNoteUseCase(fieldNoteRepo);
  const updateUseCase = new UpdateFieldNoteUseCase(fieldNoteRepo);

  const operationDate = input.operationDate ? new Date(input.operationDate) : new Date();

  const totalPrice = input.pricePerUnit != null ? input.pricePerUnit * input.quantity : undefined;

  const fieldNote = await createUseCase.execute(userId, {
    category: FieldNoteCategory.OPERATION,
    rawContent: input.rawContent,
    operationDate,
    metadata: {
      source: 'field_note_agent',
      aiProcessed: true,
      stockOperation: 'SALE_OUT',
    },
  });

  await updateUseCase.execute(fieldNote.id, userId, {
    status: 'PROCESSED',
    extractedData: {
      stockOperation: 'SALE_OUT',
      productName: product.name,
      productId: input.productId,
      stockId: createdStock.id,
      quantity: input.quantity,
      unit: input.unitOfMeasureQuantity,
      buyerName: input.buyerName,
      pricePerUnit: input.pricePerUnit,
      totalPrice,
      availableStockBefore,
      availableStockAfter,
      insufficientStock,
    },
    productId: input.productId,
    notes: input.notes,
  });

  let message = `Vendita registrata: ${input.quantity} ${input.unitOfMeasureQuantity} di ${product.name}`;
  if (input.buyerName) {
    message += ` a ${input.buyerName}`;
  }
  if (insufficientStock) {
    message += ` (ATTENZIONE: disponibilità insufficiente! Disponibili: ${availableStockBefore} ${input.unitOfMeasureQuantity})`;
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
