import type { Request, Response } from 'express';
import { AppError } from '../../../../domain/errors/AppError';
import type {
  QdcGetOperazioniParams,
  QdcImageLineRestApi,
} from '../../../services/integrations/qdc_imageline';
import {
  parseIdAziendaFrom,
  parseIdList,
  parseOptionalPositiveInt,
  parseOptionalString,
} from '../../qdc-facade/qdc-facade-params';
import { runQdcRead, sendQdcEnvelope } from '../../qdc-facade/qdc-facade-response';
import { requireQdcUserId } from '../../qdc-facade/require-qdc-user';

const CAMPO_TIPI = [
  'trattamenti',
  'fertilizzazioni',
  'lanciausiliari',
  'irrigazioni',
  'raccolte',
  'semine',
  'trapianti',
  'sovesci',
  'ispezionicampo',
] as const;

type CampoTipo = (typeof CAMPO_TIPI)[number];

function isCampoTipo(value: string): value is CampoTipo {
  return (CAMPO_TIPI as readonly string[]).includes(value);
}

function operazioniParams(request: Request): QdcGetOperazioniParams {
  return {
    idAzienda: parseIdAziendaFrom(request),
    dataPeriodoDa: parseOptionalString(request.query.dataPeriodoDa),
    dataPeriodoA: parseOptionalString(request.query.dataPeriodoA),
    listaIdUnita: parseIdList(request.query.listaIdUnita),
    idColtura: parseOptionalPositiveInt(request.query.idColtura, 'idColtura'),
  };
}

async function fetchCampo(
  api: QdcImageLineRestApi,
  tipo: CampoTipo,
  params: QdcGetOperazioniParams,
) {
  switch (tipo) {
    case 'trattamenti':
      return api.operazioniCampo.getTrattamenti(params);
    case 'fertilizzazioni':
      return api.operazioniCampo.getFertilizzazioni(params);
    case 'lanciausiliari':
      return api.operazioniCampo.getLanciAusiliari(params);
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
  }
}

/**
 * REST facade over QdcOperazioniCampoApi. Path param `tipo` selects the endpoint.
 */
export class QdcOperazioniCampoFacadeController {
  async getByTipo(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const tipo = String(request.params.tipo ?? '');
    if (!isCampoTipo(tipo)) {
      throw AppError.badRequest(
        `Unknown field operation type. Use one of: ${CAMPO_TIPI.join(', ')}`,
        'INVALID_PARAM',
      );
    }
    const params = operazioniParams(request);
    const payload = await runQdcRead(userId, (api) => fetchCampo(api, tipo, params));
    return sendQdcEnvelope(response, payload);
  }
}
