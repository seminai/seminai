import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { llmMatchAgronomicNames } from '../shared/llmAgronomicMatcher';

/**
 * Verified stocks: only count stocks that are either not linked to a job,
 * or linked to a verified job.
 */
const VERIFIED_STOCK_WHERE: Prisma.StockWhereInput = {
  OR: [{ jobId: null }, { job: { isVerified: true } }],
};

/**
 * Creates a tool that searches for products in stock for companies accessible by the user.
 * Returns product name, category, net stock quantity, company name, and registration number.
 */
export const createSearchCompanyStockTool = (userId: string): DynamicStructuredTool => {
  return new DynamicStructuredTool({
    name: 'search_company_stock_products',
    description:
      "Searches for products in stock (magazzino) for the user's agricultural companies. " +
      'Returns product name, category, registration number, company, net available quantity, and unit of measure. ' +
      'Use this when the user asks about products in stock, available products, or warehouse inventory.',
    schema: z.object({
      companyName: z
        .string()
        .optional()
        .describe('Filter by company name (partial, case-insensitive). E.g. "Rossi"'),
      category: z
        .enum(['FERTILIZER', 'PESTICIDE', 'SEED', 'HARVEST', 'EQUIPMENT', 'PACKAGING'])
        .optional()
        .describe('Filter by product category'),
      searchTerm: z
        .string()
        .optional()
        .describe('Filter by product name (partial, case-insensitive). E.g. "captano"'),
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
              select: {
                quantity: true,
                unitOfMeasureQuantity: true,
                type: true,
              },
            },
            warehouse: {
              select: {
                name: true,
                company: { select: { name: true } },
              },
            },
          },
        });

        if (products.length === 0) {
          return 'Nessun prodotto trovato con i filtri specificati.';
        }

        // Calculate net stock and filter out empty products
        const results = products
          .map((product) => {
            const netQuantity = product.stocks.reduce((total, stock) => {
              if (stock.type === 'IN' || stock.type === 'CARICO') {
                return total + Math.abs(stock.quantity);
              } else if (stock.type === 'OUT' || stock.type === 'SCARICO') {
                return total - Math.abs(stock.quantity);
              }
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

/**
 * Creates a tool that lists production units (with fields and crop info) for the user.
 * Returns production unit name, crop, variety, area, field name, and company name.
 */
export const createListProductionUnitsTool = (userId: string): DynamicStructuredTool => {
  return new DynamicStructuredTool({
    name: 'list_production_units',
    description:
      "Lists production units (unità produttive) and their fields for the user's companies. " +
      'Returns unit name, crop, variety, protocol, area (ha), field name, and company name. ' +
      'Use this when the user asks about their fields, production units, or where to apply a product.',
    schema: z.object({
      companyName: z
        .string()
        .optional()
        .describe('Filter by company name (partial, case-insensitive)'),
      cropName: z
        .string()
        .optional()
        .describe('Filter by crop name (partial, case-insensitive). E.g. "vite", "melo"'),
    }),
    func: async ({ companyName, cropName }) => {
      try {
        const entries = await prisma.productionUnitOnField.findMany({
          where: {
            field: {
              company: {
                companyUsers: { some: { userId } },
                ...(companyName && {
                  name: { contains: companyName, mode: 'insensitive' },
                }),
              },
            },
          },
          include: {
            productionUnit: {
              include: {
                cycles: {
                  orderBy: { seasonYear: 'desc' },
                  take: 1,
                },
              },
            },
            field: {
              select: {
                name: true,
                sauHa: true,
                gisHa: true,
                company: { select: { name: true } },
              },
            },
          },
        });

        if (entries.length === 0) {
          return 'Nessuna unità produttiva trovata.';
        }

        // Deduplicate by productionUnitId (a unit can span multiple fields)
        const unitMap = new Map<
          string,
          {
            name: string;
            crop: string;
            variety: string;
            protocol: string;
            totalAreaHa: number;
            fields: string[];
            companyName: string;
          }
        >();

        for (const entry of entries) {
          const pu = entry.productionUnit;
          const cycle = pu.cycles[0];

          // Filter by cropName if specified (LLM-based semantic matching)
          if (cropName && cycle) {
            const matchResult = await llmMatchAgronomicNames({
              nameA: cycle.cropName,
              nameB: cropName,
              entityType: 'crop',
            });
            if (!matchResult.isMatch) continue;
          }

          const existing = unitMap.get(pu.id);
          if (existing) {
            existing.totalAreaHa += entry.areaHaOnField;
            const fieldLabel = entry.field.name;
            if (!existing.fields.includes(fieldLabel)) {
              existing.fields.push(fieldLabel);
            }
          } else {
            unitMap.set(pu.id, {
              name: pu.name,
              crop: cycle?.cropName ?? 'N/A',
              variety: cycle?.variety ?? '',
              protocol: cycle?.protocoll ?? '',
              totalAreaHa: entry.areaHaOnField,
              fields: [entry.field.name],
              companyName: entry.field.company?.name ?? 'N/A',
            });
          }
        }

        if (unitMap.size === 0) {
          return cropName
            ? `Nessuna unità produttiva trovata con coltura "${cropName}".`
            : 'Nessuna unità produttiva trovata.';
        }

        const lines: string[] = [];
        for (const [, unit] of unitMap) {
          lines.push(
            `- **${unit.name}** | Coltura: ${unit.crop}${unit.variety ? ` (${unit.variety})` : ''} | Protocollo: ${unit.protocol} | Area: ${unit.totalAreaHa} ha | Campi: ${unit.fields.join(', ')} | Azienda: ${unit.companyName}`,
          );
        }

        return `Unità produttive (${unitMap.size}):\n${lines.join('\n')}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `Errore nella ricerca unità produttive: ${msg}`;
      }
    },
  });
};
