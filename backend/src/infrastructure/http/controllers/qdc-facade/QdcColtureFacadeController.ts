import type { Request, Response } from 'express';
import type {
  QdcGetUnitaParams,
  QdcPeriodoParams,
} from '../../../services/integrations/qdc_imageline';
import {
  parseIdAziendaFrom,
  parseIdList,
  parseOptionalBoolean,
  parseOptionalPositiveInt,
  parseOptionalString,
} from '../../qdc-facade/qdc-facade-params';
import { runQdcRead, sendQdcEnvelope } from '../../qdc-facade/qdc-facade-response';
import { requireQdcUserId } from '../../qdc-facade/require-qdc-user';

function periodoFromQuery(request: Request): QdcPeriodoParams {
  return {
    idAzienda: parseIdAziendaFrom(request),
    dataPeriodoDa: parseOptionalString(request.query.dataPeriodoDa),
    dataPeriodoA: parseOptionalString(request.query.dataPeriodoA),
  };
}

/**
 * REST facade over QdcColtureApi (production units and outgoing batches).
 */
export class QdcColtureFacadeController {
  async getUnita(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const params: QdcGetUnitaParams = {
      idAzienda: parseIdAziendaFrom(request),
      anno: parseOptionalPositiveInt(request.query.anno, 'anno'),
      listaIdUnita: parseIdList(request.query.listaIdUnita),
      idColtura: parseOptionalPositiveInt(request.query.idColtura, 'idColtura'),
      daConfermare: parseOptionalBoolean(request.query.daConfermare, 'daConfermare'),
      codice: parseOptionalString(request.query.codice),
      codiceEsterno: parseOptionalString(request.query.codiceEsterno),
      dataRifSuperficie: parseOptionalString(request.query.dataRifSuperficie),
      inizioAnnataAgraria: parseOptionalString(request.query.inizioAnnataAgraria),
    };
    const payload = await runQdcRead(userId, (api) => api.colture.getUnita(params));
    return sendQdcEnvelope(response, payload);
  }

  async getConferimenti(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) =>
      api.colture.getConferimenti(periodoFromQuery(request)),
    );
    return sendQdcEnvelope(response, payload);
  }
}
