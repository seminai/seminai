import { z } from 'zod';
import type { ToolRegistrar } from '../types.js';
import { compactShape, idAziendaShape, periodShape, qdcGet, READ_ANNOTATIONS } from './shared.js';

export const QDC_GET_GIACENZE_TOOL_NAME = 'qdc_get_giacenze';
export const QDC_GET_WAREHOUSE_MOVEMENTS_TOOL_NAME = 'qdc_get_warehouse_movements';
export const QDC_SEARCH_FERTILIZERS_TOOL_NAME = 'qdc_search_fertilizers';

export const registerQdcWarehouseReadTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    QDC_GET_GIACENZE_TOOL_NAME,
    'Read official QDC warehouse stock (agrofarmaci or fertilizzanti) for a company at a date. For Seminai internal stock use seminai_list_my_products.',
    {
      idAzienda: idAziendaShape,
      categoria: z.enum(['agrofarmaci', 'fertilizzanti']),
      data: z.string().optional().describe("Reference date 'gg/mm/aaaa'. Default: today."),
      compact: compactShape,
    },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        `/qdc/magazzino/${args.categoria}/giacenze`,
        { idAzienda: args.idAzienda, data: args.data },
        args.compact,
        'qdc_get_giacenze',
      ),
  );
  server.tool(
    QDC_GET_WAREHOUSE_MOVEMENTS_TOOL_NAME,
    'Read QDC warehouse load (carichi) or return/discharge (resi) history for agrofarmaci or fertilizzanti.',
    {
      idAzienda: idAziendaShape,
      categoria: z.enum(['agrofarmaci', 'fertilizzanti']),
      movimento: z.enum(['carichi', 'resi']),
      ...periodShape,
      compact: compactShape,
    },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        `/qdc/magazzino/${args.categoria}/${args.movimento}`,
        {
          idAzienda: args.idAzienda,
          dataPeriodoDa: args.dataPeriodoDa,
          dataPeriodoA: args.dataPeriodoA,
        },
        args.compact,
        'qdc_get_warehouse_movements',
      ),
  );
  server.tool(
    QDC_SEARCH_FERTILIZERS_TOOL_NAME,
    'Search QDC fertilizer products (catalog). Use prodKey from results before qdc_enable_fertilizer.',
    {
      ricerca: z.string().min(1).describe('Search string (product name or fragment).'),
      idAzienda: z.number().int().positive().optional(),
      utilizzati: z.boolean().optional(),
      abilitati: z.boolean().optional(),
      compact: compactShape,
    },
    READ_ANNOTATIONS,
    async (args) =>
      qdcGet(
        http,
        '/qdc/prodotti/fertilizzanti',
        {
          ricerca: args.ricerca,
          idAzienda: args.idAzienda,
          utilizzati: args.utilizzati,
          abilitati: args.abilitati,
        },
        args.compact,
        'qdc_search_fertilizers',
      ),
  );
};
