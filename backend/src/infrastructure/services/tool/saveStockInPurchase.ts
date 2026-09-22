import { z } from 'zod';
import { PrismaClient, FieldNoteCategory, ProductCategory } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { Stock } from '../../../domain/entities/Stock';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { FitosanitariLookupService } from '../utils/FitosanitariLookupService';
import { mapToProductCategory } from '../../../application/use-cases/product/product-category.mapper';
import { assertCompanyAccess } from '../agents/shared/authorization';

export const SaveStockInPurchaseSchema = z.object({
  companyId: z.string().describe("ID dell'azienda per il magazzino"),
  warehouseId: z.string().optional().describe('ID del magazzino (opzionale, auto-risolto)'),
  productName: z.string().describe('Nome del prodotto'),
  productCategory: z
    .enum(['FERTILIZER', 'PESTICIDE', 'SEED', 'EQUIPMENT', 'PACKAGING'])
    .optional()
    .describe('Categoria del prodotto'),
  registrationNumber: z.string().optional().describe('Numero di registrazione (per fitosanitari)'),
  existingProductId: z
    .string()
    .optional()
    .describe('ID del prodotto se già esistente in magazzino'),
  quantity: z.number().positive().describe('Quantità acquistata'),
  unitOfMeasureQuantity: z.string().describe('Unità di misura (kg, L, pz)'),
  price: z.number().optional().describe('Prezzo unitario'),
  unitOfMeasurePrice: z.string().optional().describe('Unità di misura prezzo (EUR/kg, EUR/L)'),
  documentType: z
    .enum(['DDT', 'INVOICE', 'LABEL', 'OTHER'])
    .optional()
    .describe('Tipo di documento allegato'),
  documentCode: z.string().optional().describe('Codice DDT o fattura'),
  documentDate: z.string().optional().describe('Data del documento (ISO 8601)'),
  documentDueDate: z.string().optional().describe('Data scadenza fattura (ISO 8601)'),
  documentUrl: z.string().optional().describe('URL del file allegato'),
  supplierName: z.string().optional().describe('Nome del fornitore'),
  supplierAddress: z.string().optional().describe('Indirizzo del fornitore'),
  supplierVatNumber: z.string().optional().describe('P.IVA del fornitore'),
  rawContent: z.string().describe("Testo originale dell'utente"),
  operationDate: z.string().optional().describe("Data dell'operazione (ISO 8601)"),
  notes: z.string().optional().describe('Note aggiuntive'),
});

export type SaveStockInPurchaseInput = z.infer<typeof SaveStockInPurchaseSchema>;

export interface SaveStockInPurchaseResult {
  success: boolean;
  fieldNoteId: string;
  stockId: string;
  productId: string;
  productName: string;
  isNewProduct: boolean;
  message: string;
}

export async function saveStockInPurchase(
  userId: string,
  prisma: PrismaClient,
  input: SaveStockInPurchaseInput,
): Promise<SaveStockInPurchaseResult> {
  await assertCompanyAccess(userId, input.companyId);
  const warehouseId = await resolveWarehouseForCompany(prisma, input.companyId, input.warehouseId);

  // Find or create product
  let productId: string;
  let isNewProduct = false;

  if (input.existingProductId) {
    const existing = await prisma.product.findUnique({
      where: { id: input.existingProductId },
    });
    if (!existing || existing.warehouseId !== warehouseId) {
      throw new Error(
        `Prodotto con ID ${input.existingProductId} non trovato nel magazzino selezionato`,
      );
    }
    productId = existing.id;
  } else {
    const existingByName = await prisma.product.findFirst({
      where: {
        warehouseId,
        name: { equals: input.productName.trim(), mode: 'insensitive' },
      },
    });

    if (existingByName) {
      productId = existingByName.id;
    } else {
      const registrationNumber = input.registrationNumber?.trim() ?? null;
      const category = mapToProductCategory(
        input.productCategory ?? ProductCategory.FERTILIZER,
        registrationNumber,
      );
      const fitosanitariService = FitosanitariLookupService.getInstance();
      const administrativeStatus =
        category === ProductCategory.PESTICIDE
          ? fitosanitariService.lookupStatus(registrationNumber, input.productName.trim())
          : null;

      const created = await prisma.product.create({
        data: {
          name: input.productName.trim(),
          sku: 'N/A',
          category,
          type: 'Acquisto',
          warehouseId,
          administrativeStatus,
          registrationNumber,
        },
      });
      productId = created.id;
      isNewProduct = true;
    }
  }

  // Create Stock IN movement
  const stockRepo = new PrismaStockRepository(prisma);
  const docDate = input.documentDate ? new Date(input.documentDate) : null;
  const invoiceDueDate = input.documentDueDate ? new Date(input.documentDueDate) : null;

  const stock = Stock.create({
    productId,
    quantity: input.quantity,
    unitOfMeasureQuantity: input.unitOfMeasureQuantity,
    price: input.price ?? 0,
    unitOfMeasurePrice: input.unitOfMeasurePrice ?? 'EUR',
    type: 'IN',
    ddtCode: input.documentType === 'DDT' ? input.documentCode ?? null : null,
    ddtDate: input.documentType === 'DDT' ? docDate : null,
    ddtUrlFile: input.documentType === 'DDT' ? input.documentUrl ?? null : null,
    invoiceCode: input.documentType === 'INVOICE' ? input.documentCode ?? null : null,
    invoiceDate: input.documentType === 'INVOICE' ? docDate : null,
    invoiceDueDate: input.documentType === 'INVOICE' ? invoiceDueDate : null,
    invoiceUrlFile: input.documentType === 'INVOICE' ? input.documentUrl ?? null : null,
    companySupplierName: input.supplierName ?? null,
    addressSupplier: input.supplierAddress ?? null,
    vatNumberSupplier: input.supplierVatNumber ?? null,
  });

  const createdStock = await stockRepo.create(stock);

  // Create FieldNote with PROCESSED status
  const fieldNoteRepo = new PrismaFieldNoteRepository(prisma);
  const createUseCase = new CreateFieldNoteUseCase(fieldNoteRepo);
  const updateUseCase = new UpdateFieldNoteUseCase(fieldNoteRepo);

  const operationDate = input.operationDate ? new Date(input.operationDate) : new Date();

  const fieldNote = await createUseCase.execute(userId, {
    category: FieldNoteCategory.OPERATION,
    rawContent: input.rawContent,
    operationDate,
    metadata: {
      source: 'field_note_agent',
      aiProcessed: true,
      stockOperation: 'PURCHASE_IN',
    },
  });

  await updateUseCase.execute(fieldNote.id, userId, {
    status: 'PROCESSED',
    extractedData: {
      stockOperation: 'PURCHASE_IN',
      productName: input.productName,
      productId,
      stockId: createdStock.id,
      quantity: input.quantity,
      unit: input.unitOfMeasureQuantity,
      documentType: input.documentType,
      documentCode: input.documentCode,
      supplierName: input.supplierName,
      isNewProduct,
    },
    productId,
    notes: input.notes,
  });

  return {
    success: true,
    fieldNoteId: fieldNote.id,
    stockId: createdStock.id,
    productId,
    productName: input.productName,
    isNewProduct,
    message: `Carico magazzino registrato: ${input.quantity} ${input.unitOfMeasureQuantity} di ${input.productName}${isNewProduct ? ' (nuovo prodotto creato)' : ''}`,
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
