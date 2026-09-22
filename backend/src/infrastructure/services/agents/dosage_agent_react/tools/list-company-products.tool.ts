import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaProductRepository } from '../../../../repositories/PrismaProductRepository';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';

interface WarehouseCompanyInfo {
  id?: string;
  name?: string;
}

interface WarehouseInfo {
  name?: string;
  company?: WarehouseCompanyInfo;
}

/**
 * Tool: list_company_products
 * Lists phytosanitary products in company warehouses with stock levels.
 */
export function createListCompanyProductsTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_company_products',
    description: `Elenca i prodotti fitosanitari a magazzino dell'utente con livelli di stock disponibile.
Parametri opzionali: companyId o companyName per filtrare per azienda.
Salva il risultato in working memory (inputProducts) per i tool successivi del workflow.

IMPORTANTE: Se hai già chiamato questo tool nella stessa conversazione e i dati sono in working memory,
NON richiamare — usa i dati già disponibili. Richiama SOLO se devi filtrare per un'azienda diversa.
Se l'utente ha già specificato l'azienda, DEVI passare companyId o companyName per evitare di caricare tutte le aziende.`,
    schema: z.object({
      companyId: z
        .string()
        .optional()
        .describe(
          'Filtra per ID azienda (UUID). IMPORTANTE: deve essere il valore "id" ottenuto da list_user_companies — NON il nome dell\'azienda. Se non hai ancora chiamato list_user_companies, usa companyName oppure ometti questo parametro.',
        ),
      companyName: z
        .string()
        .optional()
        .describe('Filtra per nome azienda (ricerca parziale case-insensitive).'),
      forceRefresh: z
        .boolean()
        .optional()
        .default(false)
        .describe('Forza il ricaricamento anche se i dati sono già in working memory.'),
    }),
    func: async ({ companyId, companyName, forceRefresh }) => {
      const wm = getWorkingMemory(threadId);
      // If no explicit filter is passed but a single @company mention was
      // promoted to WM, use it. Avoids name-match fallback when the user has
      // multiple companies and prevents tools downstream from working with
      // companyId=none.
      if (!companyId && !companyName && wm.currentCompanyId) {
        companyId = wm.currentCompanyId;
      }
      console.log(
        `[list_company_products] called — userId=${userId} companyId=${companyId ?? 'none'} companyName=${companyName ?? 'none'} forceRefresh=${forceRefresh}`,
      );
      if (
        !forceRefresh &&
        wm.inputProducts &&
        wm.inputProducts.length > 0 &&
        !companyId &&
        !companyName
      ) {
        return JSON.stringify({
          productsFound: wm.inputProducts.length,
          cachedFromWorkingMemory: true,
          message: `Working memory contiene già ${wm.inputProducts.length} prodotti. Usa questi dati senza richiamare il tool. Per filtrare, passa companyId o companyName.`,
        });
      }

      // Guard: companyId must be a valid UUID obtained from list_user_companies, not a company name
      if (companyId) {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(companyId)) {
          console.warn(
            `[list_company_products] Invalid companyId format: "${companyId}". Must be a UUID from list_user_companies.`,
          );
          return JSON.stringify({
            error: `companyId non valido: "${companyId}". Devi usare l'ID UUID ottenuto da list_user_companies, non il nome dell'azienda.`,
            suggestion:
              'Chiama prima list_user_companies per ottenere il companyId corretto, oppure usa companyName per filtrare per nome.',
          });
        }
      }

      try {
        const repo = new PrismaProductRepository(prisma);
        let products = await repo.findManyByUserId(userId, companyName);

        // Apply companyId filter if provided
        if (companyId) {
          products = products.filter(
            (p) => (p.warehouse as WarehouseInfo | undefined)?.company?.id === companyId,
          );
        }

        const mapped = products.map((p) => {
          // Calculate available stock from stock movements
          const stocks = (p.stocks ?? []) as Array<{
            type: string;
            quantity: number;
            unitOfMeasureQuantity: string;
          }>;
          const available = stocks.reduce((total, stock) => {
            if (stock.type === 'IN' || stock.type === 'CARICO') {
              return total + Math.abs(stock.quantity);
            } else if (stock.type === 'OUT' || stock.type === 'SCARICO') {
              return total - Math.abs(stock.quantity);
            }
            return total;
          }, 0);

          const stockUnit = stocks.length > 0 ? stocks[0].unitOfMeasureQuantity : 'kg';
          const warehouse = p.warehouse as WarehouseInfo | undefined;

          return {
            id: p.id,
            name: p.name,
            registrationNumber: p.registrationNumber,
            category: p.category,
            type: p.type,
            warehouseName: warehouse?.name ?? null,
            companyName: warehouse?.company?.name ?? null,
            companyId: warehouse?.company?.id ?? null,
            stockAvailable: Math.round(available * 100) / 100,
            stockUnit,
          };
        });

        const withStock = mapped.filter((p) => p.stockAvailable > 0);
        const noStock = mapped.filter((p) => p.stockAvailable <= 0);

        // Populate working memory for downstream tools (only products with stock)
        updateWorkingMemory(threadId, {
          inputProducts: withStock.map((p) => ({
            productName: p.name,
            registrationNumber: p.registrationNumber,
            quantity: p.stockAvailable,
            quantityUnitOfMeasure: p.stockUnit,
          })),
        });

        console.log(
          `[list_company_products] results — total=${mapped.length} withStock=${withStock.length} userId=${userId} companyId=${companyId ?? 'none'} companyName=${companyName ?? 'none'}`,
        );

        const noResultsMessage = companyId
          ? `Nessun prodotto fitosanitario trovato per companyId="${companyId}". Verifica che il companyId sia corretto tramite list_user_companies.`
          : 'Nessun prodotto fitosanitario trovato a magazzino.';

        // Return the full index sorted by stock descending.
        const sortedWithStock = withStock.sort((a, b) => b.stockAvailable - a.stockAvailable);
        const sortedNoStock = noStock.sort((a, b) => a.name.localeCompare(b.name));

        return JSON.stringify({
          productsFound: mapped.length,
          productsWithStock: withStock.length,
          productIndex: sortedWithStock.map((p, i) => ({
            idx: i,
            name: p.name,
            registrationNumber: p.registrationNumber,
            stock: `${p.stockAvailable} ${p.stockUnit}`,
          })),
          noStockCount: noStock.length,
          noStockNames:
            noStock.length <= 5
              ? sortedNoStock.map((p) => p.name)
              : [
                  ...sortedNoStock.slice(0, 3).map((p) => p.name),
                  `...e altri ${noStock.length - 3}`,
                ],
          workingMemoryKey: 'inputProducts',
          message:
            mapped.length === 0
              ? noResultsMessage
              : `Trovati ${mapped.length} prodotti (${withStock.length} con stock). Dati completi in working memory. Usa get_working_memory_details per dettagli specifici.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error(
          `[list_company_products] error — userId=${userId} companyId=${companyId ?? 'none'}:`,
          error,
        );
        return JSON.stringify({ error: msg });
      }
    },
  });
}
