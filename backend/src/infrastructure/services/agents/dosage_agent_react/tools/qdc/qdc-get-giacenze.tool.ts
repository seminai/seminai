import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  getQdcApiFromClientId,
  getTodayIT,
  parseTableToRecords,
} from '../../../../integrations/qdc_imageline';
import { QDC_DISABLED_MESSAGE, describeQdcError, getQdcClientIdForUser } from './require-qdc';

const schema = z.object({
  idAzienda: z
    .number()
    .int()
    .positive()
    .describe("ID dell'azienda QDC (risolvilo con qdc_list_companies)."),
  categoria: z
    .enum(['agrofarmaci', 'fertilizzanti'])
    .describe('Magazzino QDC da consultare: agrofarmaci oppure fertilizzanti.'),
  data: z
    .string()
    .optional()
    .describe("Data di riferimento della giacenza, formato 'gg/mm/aaaa'. Default: oggi."),
});

/**
 * Tool: qdc_get_giacenze
 * Reads warehouse stock levels (agrofarmaci or fertilizzanti) from the user's
 * official QDC logbook at a reference date. Read-only, fail-soft.
 */
export function createQdcGetGiacenzeTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'qdc_get_giacenze',
    description: `Legge dal QDC (Quaderno di Campagna ufficiale di Image Line) le giacenze di magazzino di un'azienda a una data: agrofarmaci oppure fertilizzanti.
Usa questo tool quando l'utente chiede le scorte risultanti sul Quaderno di Campagna ufficiale. Per il magazzino interno di Seminai usa invece search_company_stock_products. Richiede l'id azienda QDC da qdc_list_companies.`,
    schema,
    func: async (args) => {
      const clientId = await getQdcClientIdForUser(userId);
      if (!clientId) {
        return JSON.stringify({ available: false, reason: QDC_DISABLED_MESSAGE });
      }
      try {
        const api = await getQdcApiFromClientId(clientId);
        const data = args.data ?? getTodayIT();
        const response =
          args.categoria === 'agrofarmaci'
            ? await api.magazzinoAgrofarmaci.getGiacenzeAgrofarmaci({
                idAzienda: args.idAzienda,
                data,
              })
            : await api.magazzinoFertilizzanti.getGiacenzeFertilizzanti({
                idAzienda: args.idAzienda,
                data,
              });
        const giacenze = parseTableToRecords(response.result);
        return JSON.stringify({
          available: true,
          categoria: args.categoria,
          data,
          count: giacenze.length,
          giacenze,
        });
      } catch (error) {
        return JSON.stringify({ available: false, reason: describeQdcError(error) });
      }
    },
  });
}
