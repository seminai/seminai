import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  getQdcApiFromClientId,
  parseTableToRecords,
  QdcImageLineRestApi,
} from '../../../../integrations/qdc_imageline';
import type {
  QdcApiResponse,
  QdcGetOperazioniParams,
  QdcTableResult,
} from '../../../../integrations/qdc_imageline';
import { QDC_DISABLED_MESSAGE, describeQdcError, getQdcClientIdForUser } from './require-qdc';

const MAX_RETURNED_OPERATIONS = 200;

const OPERATION_TYPES = [
  'trattamenti',
  'fertilizzazioni',
  'irrigazioni',
  'raccolte',
  'semine',
  'trapianti',
  'sovesci',
  'ispezionicampo',
  'lanciausiliari',
  'altreoperazioni',
] as const;

const schema = z.object({
  idAzienda: z
    .number()
    .int()
    .positive()
    .describe("ID dell'azienda QDC (risolvilo con qdc_list_companies)."),
  tipo: z
    .enum(OPERATION_TYPES)
    .describe('Tipo di operazione colturale da leggere dal Quaderno di Campagna.'),
  dataDa: z
    .string()
    .optional()
    .describe(
      "Inizio periodo, formato 'gg/mm/aaaa' o 'aaaa-mm-gg'. Default: un anno prima di dataA.",
    ),
  dataA: z
    .string()
    .optional()
    .describe(
      "Fine periodo (max 365 giorni dopo dataDa), formato 'gg/mm/aaaa' o 'aaaa-mm-gg'. Default: oggi.",
    ),
  idColtura: z.number().int().optional().describe('Filtra le operazioni per ID coltura QDC.'),
});

type QdcGetOperationsArgs = z.infer<typeof schema>;

async function fetchOperations(
  api: QdcImageLineRestApi,
  args: QdcGetOperationsArgs,
): Promise<QdcApiResponse<QdcTableResult>> {
  const params: QdcGetOperazioniParams = {
    idAzienda: args.idAzienda,
    dataPeriodoDa: args.dataDa,
    dataPeriodoA: args.dataA,
    idColtura: args.idColtura,
  };
  switch (args.tipo) {
    case 'trattamenti':
      return api.operazioniCampo.getTrattamenti(params);
    case 'fertilizzazioni':
      return api.operazioniCampo.getFertilizzazioni(params);
    case 'irrigazioni':
      return api.operazioniCampo.getIrrigazioni(params);
    case 'raccolte':
      return api.operazioniCampo.getRaccolte(params);
    case 'semine':
      return api.operazioniCampo.getSemine(params);
    case 'trapianti':
      return api.operazioniCampo.getTrapianti(params);
    case 'sovesci':
      return api.operazioniCampo.getSovesci(params);
    case 'ispezionicampo':
      return api.operazioniCampo.getIspezioniCampo(params);
    case 'lanciausiliari':
      return api.operazioniCampo.getLanciAusiliari(params);
    case 'altreoperazioni':
      return api.operazioniRegistro.getAltreOperazioni(params);
  }
}

/**
 * Tool: qdc_get_operations
 * Reads registered field operations (treatments, fertilizations, irrigations,
 * harvests, ...) from the user's official QDC field logbook. Read-only,
 * fail-soft on missing configuration or QDC API errors.
 */
export function createQdcGetOperationsTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'qdc_get_operations',
    description: `Legge dal QDC (Quaderno di Campagna ufficiale di Image Line) le operazioni colturali registrate per un'azienda in un periodo: trattamenti fitosanitari, fertilizzazioni, irrigazioni, raccolte, semine, trapianti, sovesci, ispezioni in campo, lanci di ausiliari e altre operazioni.
Usa questo tool quando l'utente chiede cosa risulta registrato sul Quaderno di Campagna (storico ufficiale), ad esempio per verificare trattamenti già effettuati prima di pianificarne di nuovi. Richiede l'id azienda QDC da qdc_list_companies.`,
    schema,
    func: async (args) => {
      const clientId = await getQdcClientIdForUser(userId);
      if (!clientId) {
        return JSON.stringify({ available: false, reason: QDC_DISABLED_MESSAGE });
      }
      try {
        const api = await getQdcApiFromClientId(clientId);
        const response = await fetchOperations(api, args);
        const records = parseTableToRecords(response.result);
        return JSON.stringify({
          available: true,
          tipo: args.tipo,
          count: records.length,
          truncated: records.length > MAX_RETURNED_OPERATIONS,
          operations: records.slice(0, MAX_RETURNED_OPERATIONS),
        });
      } catch (error) {
        return JSON.stringify({ available: false, reason: describeQdcError(error) });
      }
    },
  });
}
