import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getAllCompanies, getQdcApiFromClientId } from '../../../../integrations/qdc_imageline';
import { QDC_DISABLED_MESSAGE, describeQdcError, getQdcClientIdForUser } from './require-qdc';

const schema = z.object({
  includiDisabilitate: z
    .boolean()
    .default(false)
    .describe('Includi anche le aziende disabilitate della licenza QDC.'),
});

/**
 * Tool: qdc_list_companies
 * Lists the companies linked to the user's QDC (Quaderno di Campagna) license.
 * Read-only, fail-soft: returns {available:false, reason} when the QDC client
 * ID is missing from Settings or the QDC API rejects the call.
 */
export function createQdcListCompaniesTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'qdc_list_companies',
    description: `Elenca le aziende collegate alla licenza QDC (Quaderno di Campagna di Image Line) dell'utente.
Restituisce per ogni azienda: id (l'id_azienda da usare negli altri tool qdc_*), ragione sociale, partita IVA, codice fiscale e validità.
Usa questo tool per risolvere l'id azienda QDC prima di chiamare qdc_get_operations o qdc_get_giacenze. Non confondere queste aziende con quelle interne di Seminai (list_user_companies).`,
    schema,
    func: async (args) => {
      const clientId = await getQdcClientIdForUser(userId);
      if (!clientId) {
        return JSON.stringify({ available: false, reason: QDC_DISABLED_MESSAGE });
      }
      try {
        const api = await getQdcApiFromClientId(clientId);
        const companies = await getAllCompanies(api, args.includiDisabilitate);
        return JSON.stringify({ available: true, count: companies.length, companies });
      } catch (error) {
        return JSON.stringify({ available: false, reason: describeQdcError(error) });
      }
    },
  });
}
