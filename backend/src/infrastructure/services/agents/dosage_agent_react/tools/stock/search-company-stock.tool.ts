import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../../../repositories/Prisma';

/**
 * Verified stocks: only count stocks not linked to a job, or linked to a verified job.
 */
const VERIFIED_STOCK_WHERE: Prisma.StockWhereInput = {
  OR: [{ jobId: null }, { job: { isVerified: true } }],
};

/**
 * Tool: search_company_stock_products
 * Searches for products in stock (warehouse) for the user's companies.
 * Filters by verified stocks only, calculates net quantity.
 */
export const createSearchCompanyStockTool = (userId: string): DynamicStructuredTool => {
  return new DynamicStructuredTool({
    name: 'search_company_stock_products',
    description:
      "Cerca prodotti a magazzino per le aziende dell'utente. " +
      'Restituisce nome, categoria, numero registrazione, azienda, giacenza netta e unità di misura. ' +
      'Filtra solo stock verificati. Complementare a list_company_products (che mostra tutti i prodotti).',
    schema: z.object({
      companyName: z
        .string()
        .optional()
        .describe('Filtra per nome azienda (parziale, case-insensitive)'),
      category: z
        .enum(['FERTILIZER', 'PESTICIDE', 'SEED', 'HARVEST', 'EQUIPMENT', 'PACKAGING'])
        .optional()
        .describe('Filtra per categoria prodotto'),
      searchTerm: z
        .string()
        .optional()
        .describe('Filtra per nome prodotto (parziale, case-insensitive)'),
    }),
    func: async ({ companyName, category, searchTerm }) => {
      try {
        const userCompanies = await prisma.userOnCompany.findMany({
          where: { userId },
          select: { companyId: true },
        });
        const companyIds = userCompanies.map((uc) => uc.companyId);
        if (companyIds.length === 0) {
          return 'Nessuna azienda trovata per questo utente.';
        }

        const warehouseWhere: Prisma.WarehouseWhereInput = {
          companyId: { in: companyIds },
        };
        if (companyName) {
          warehouseWhere.company = {
            name: { contains: companyName, mode: 'insensitive' },
          };
        }

        const products = await prisma.product.findMany({
          where: {
            warehouse: warehouseWhere,
            ...(category && { category }),
            ...(searchTerm && {
              name: { contains: searchTerm, mode: 'insensitive' },
            }),
          },
          include: {
            stocks: {
              where: VERIFIED_STOCK_WHERE,
              select: { quantity: true, unitOfMeasureQuantity: true, type: true },
            },
            warehouse: {
              select: { name: true, company: { select: { name: true } } },
            },
          },
        });

        if (products.length === 0) {
          return 'Nessun prodotto trovato con i filtri specificati.';
        }

        const results = products
          .map((product) => {
            // Use Math.abs so the stock type determines direction,
            // regardless of whether the DB stores OUT as negative or positive.
            const netQuantity = product.stocks.reduce((total, stock) => {
              if (stock.type === 'IN' || stock.type === 'CARICO')
                return total + Math.abs(stock.quantity);
              if (stock.type === 'OUT' || stock.type === 'SCARICO')
                return total - Math.abs(stock.quantity);
              return total;
            }, 0);
            const unit =
              product.stocks.find((s) => s.unitOfMeasureQuantity)?.unitOfMeasureQuantity ?? '';
            return {
              name: product.name,
              category: product.category,
              registrationNumber: product.registrationNumber,
              companyName: product.warehouse.company.name,
              warehouseName: product.warehouse.name,
              netQuantity: Math.round(netQuantity * 100) / 100,
              unit,
            };
          })
          .filter((p) => p.netQuantity > 0);

        if (results.length === 0) {
          return 'Nessun prodotto con giacenza positiva trovato.';
        }

        const lines = results.map(
          (p) =>
            `- **${p.name}** (${p.category}) | Azienda: ${p.companyName} | Magazzino: ${p.warehouseName} | Giacenza: ${p.netQuantity} ${p.unit}${p.registrationNumber ? ` | Reg: ${p.registrationNumber}` : ''}`,
        );
        return `Prodotti in magazzino (${results.length}):\n${lines.join('\n')}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `Errore nella ricerca prodotti: ${msg}`;
      }
    },
  });
};
