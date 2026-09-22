import { DynamicStructuredTool } from '@langchain/core/tools';
import { CompanyKind } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaProductRepository } from '../../../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../../../repositories/PrismaStockRepository';
import { PrismaWarehouseRepository } from '../../../../repositories/PrismaWarehouseRepository';
import { PrismaCompanyRepository } from '../../../../repositories/PrismaCompanyRepository';
import { ImportProductsFromCsvExcelUseCase } from '../../../../../application/use-cases/product/ImportProductsFromCsvExcelUseCase';
import {
  CreateOrUpdateProductsAndStocksBulkUseCase,
  ProductWithStockInput,
} from '../../../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { getWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import type { WorkingMemory } from '../type/state';

interface StockPreviewEntry {
  name: string;
  category: string;
  registrationNumber: string | null;
  stock: {
    quantity: number;
    unitOfMeasureQuantity: string;
    price: number;
    type: 'IN' | 'OUT';
    ddtCode: string;
    ddtDate: string;
    invoiceCode: string | null;
    companySupplierName: string | null;
  };
}

/**
 * Tool: import_stock_from_file
 * Persists stock/product data from an extracted file to the database.
 * REQUIRES USER APPROVAL.
 */
export function createImportStockFromFileTool(
  threadId: string,
  userId: string,
  kindFilter?: CompanyKind,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'import_stock_from_file',
    description: `Importa nel database i prodotti e movimenti di magazzino estratti da un file.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare, DEVI aver eseguito extract_from_file (che ha rilevato un file magazzino/fattura)
e aver presentato l'anteprima all'utente.
L'utente deve confermare esplicitamente prima dell'importazione.
Richiede extractedStockData dalla working memory.
Richiede un companyId valido — usa list_user_companies per ottenerlo.`,
    schema: z.object({
      companyId: z.string().describe("ID dell'azienda a cui associare i prodotti e stock."),
      warehouseId: z
        .string()
        .optional()
        .describe('ID magazzino (opzionale). Se omesso, viene auto-risolto o creato.'),
    }),
    func: async ({ companyId, warehouseId }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'extractedStockData')) {
          return JSON.stringify({
            error: 'Prerequisito mancante: extractedStockData',
            hint: 'Eseguire prima extract_from_file per estrarre i dati dal file.',
          });
        }

        const wm = getWorkingMemory(threadId);
        const detectedType = wm.detectedFileType as string | undefined;

        // Verify company exists
        const companyRepo = new PrismaCompanyRepository(prisma);
        const userCompanies = await companyRepo.findManyByUserId(userId);
        const targetCompany = userCompanies.find((c) => c.id === companyId);
        if (!targetCompany) {
          return JSON.stringify({
            error: `Azienda ${companyId} non trovata tra le aziende dell'utente.`,
            hint: 'Usa list_user_companies per ottenere un companyId valido.',
            availableCompanies: userCompanies.map((c) => ({ id: c.id, name: c.name })),
          });
        }
        // Defense-in-depth: a manufacturing chat must not import stock into an
        // agricultural company (and vice versa). No-op when no filter is set.
        if (kindFilter && targetCompany.kind !== kindFilter) {
          return JSON.stringify({
            error: `L'azienda selezionata non è di tipo ${kindFilter}.`,
            hint: "Seleziona un'azienda compatibile con il contesto corrente.",
          });
        }

        const productRepo = new PrismaProductRepository(prisma);
        const stockRepo = new PrismaStockRepository(prisma);
        const warehouseRepo = new PrismaWarehouseRepository(prisma);

        // Route based on detected file type
        if (detectedType === 'warehouse_stock') {
          // CSV/Excel stock: re-run ImportProductsFromCsvExcelUseCase with preview: false
          return await importFromCsvExcel(
            wm,
            companyId,
            warehouseId,
            productRepo,
            stockRepo,
            warehouseRepo,
          );
        }

        // Invoice/DDT PDF: use bulk upsert with extracted stock data
        return await importFromInvoiceData(
          wm,
          companyId,
          warehouseId,
          productRepo,
          stockRepo,
          warehouseRepo,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

async function importFromCsvExcel(
  wm: WorkingMemory,
  companyId: string,
  warehouseId: string | undefined,
  productRepo: PrismaProductRepository,
  stockRepo: PrismaStockRepository,
  warehouseRepo: PrismaWarehouseRepository,
): Promise<string> {
  if (!wm.uploadedFileBuffer) {
    return JSON.stringify({
      error: 'File buffer non più disponibile in working memory.',
      hint: "Caricare nuovamente il file e ripetere l'estrazione.",
    });
  }

  const fileBuffer = wm.uploadedFileBuffer as Buffer;
  const fileName = (wm.uploadedFileName as string) || 'file';

  const useCase = new ImportProductsFromCsvExcelUseCase(productRepo, stockRepo, warehouseRepo);
  const result = await useCase.execute({
    companyId,
    warehouseId,
    fileBuffer,
    fileName,
    preview: false,
  });

  return JSON.stringify({
    companyId,
    productsCreated: result.productsCreated,
    productsUpdated: result.productsUpdated,
    stocksCreated: result.stocksCreated,
    errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
    message:
      result.errors.length === 0
        ? `Importazione completata: ${result.productsCreated} prodotti creati, ${result.productsUpdated} aggiornati, ${result.stocksCreated} movimenti stock.`
        : `Importazione parziale: ${result.productsCreated + result.productsUpdated} prodotti, ${result.stocksCreated} stock. ${result.errors.length} errori.`,
  });
}

async function importFromInvoiceData(
  wm: WorkingMemory,
  companyId: string,
  warehouseId: string | undefined,
  productRepo: PrismaProductRepository,
  stockRepo: PrismaStockRepository,
  warehouseRepo: PrismaWarehouseRepository,
): Promise<string> {
  const stockEntries = wm.extractedStockData as StockPreviewEntry[];
  if (!stockEntries || stockEntries.length === 0) {
    return JSON.stringify({
      error: 'Nessun dato stock trovato in working memory.',
      hint: 'Eseguire prima extract_from_file per estrarre i dati.',
    });
  }

  // Map StockPreviewEntry to ProductWithStockInput
  const products: ProductWithStockInput[] = stockEntries.map((entry) => ({
    name: entry.name,
    category: entry.category,
    registrationNumber: entry.registrationNumber ?? undefined,
    stock: {
      quantity: entry.stock.quantity,
      unitOfMeasureQuantity: entry.stock.unitOfMeasureQuantity,
      price: entry.stock.price,
      type: entry.stock.type,
      ddtCode: entry.stock.ddtCode,
      ddtDate: entry.stock.ddtDate,
      invoiceCode: entry.stock.invoiceCode ?? undefined,
      companySupplierName: entry.stock.companySupplierName ?? undefined,
    },
  }));

  const useCase = new CreateOrUpdateProductsAndStocksBulkUseCase(
    productRepo,
    stockRepo,
    warehouseRepo,
  );
  const result = await useCase.execute({
    companyId,
    warehouseId,
    products,
  });

  return JSON.stringify({
    companyId,
    productsCreated: result.productsCreated,
    productsUpdated: result.productsUpdated,
    stocksCreated: result.stocksCreated,
    errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
    message:
      result.errors.length === 0
        ? `Importazione fattura completata: ${result.productsCreated} prodotti creati, ${result.productsUpdated} aggiornati, ${result.stocksCreated} movimenti stock.`
        : `Importazione parziale: ${result.productsCreated + result.productsUpdated} prodotti, ${result.stocksCreated} stock. ${result.errors.length} errori.`,
  });
}
