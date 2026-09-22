import type { Request, Response } from 'express';
import type {
  QdcSetCaricoFertilizzanteParams,
  QdcSetResoFertilizzanteParams,
} from '../../../services/integrations/qdc_imageline';
import { getTodayIT } from '../../../services/integrations/qdc_imageline';
import {
  parseFertilizzanteUdm,
  parseFiniteNumber,
  parseIdAziendaFrom,
  parseOptionalPositiveInt,
  parseOptionalString,
  parsePositiveInt,
  parseRequiredString,
  parseTipoScarico,
} from '../../qdc-facade/qdc-facade-params';
import { runQdcRead, runQdcWrite, sendQdcEnvelope } from '../../qdc-facade/qdc-facade-response';
import { requireQdcUserId } from '../../qdc-facade/require-qdc-user';

/**
 * REST facade over QdcMagazzinoFertilizzantiApi.
 */
export class QdcMagazzinoFertilizzantiFacadeController {
  async getGiacenze(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) =>
      api.magazzinoFertilizzanti.getGiacenzeFertilizzanti({
        idAzienda: parseIdAziendaFrom(request),
        data: parseOptionalString(request.query.data) ?? getTodayIT(),
        idAbilitato: parseOptionalPositiveInt(request.query.idAbilitato, 'idAbilitato'),
      }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async getCarichi(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) =>
      api.magazzinoFertilizzanti.getCarichiFertilizzanti({
        idAzienda: parseIdAziendaFrom(request),
        dataPeriodoDa: parseOptionalString(request.query.dataPeriodoDa),
        dataPeriodoA: parseOptionalString(request.query.dataPeriodoA),
        idAbilitato: parseOptionalPositiveInt(request.query.idAbilitato, 'idAbilitato'),
      }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async setCarico(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const params: QdcSetCaricoFertilizzanteParams = {
      idAzienda: parsePositiveInt(request.body?.idAzienda, 'idAzienda'),
      dataCarico: parseRequiredString(request.body?.dataCarico, 'dataCarico'),
      idAbilitato: parsePositiveInt(request.body?.idAbilitato, 'idAbilitato'),
      qta: parseFiniteNumber(request.body?.qta, 'qta'),
      udm: parseFertilizzanteUdm(request.body?.udm),
      numeroFattura: parseOptionalString(request.body?.numeroFattura),
      note: parseOptionalString(request.body?.note),
    };
    const payload = await runQdcWrite(userId, 'setCaricoFertilizzante', params, (api) =>
      api.magazzinoFertilizzanti.setCaricoFertilizzante(params),
    );
    return sendQdcEnvelope(response, payload);
  }

  async delCarico(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parseIdAziendaFrom(request);
    const idCarico = parsePositiveInt(request.params.idCarico, 'idCarico');
    const payload = await runQdcWrite(
      userId,
      'delCaricoFertilizzante',
      { idAzienda, idCarico },
      (api) => api.magazzinoFertilizzanti.delCaricoFertilizzante({ idAzienda, idCarico }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async getResi(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) =>
      api.magazzinoFertilizzanti.getResiFertilizzanti({
        idAzienda: parseIdAziendaFrom(request),
        dataPeriodoDa: parseOptionalString(request.query.dataPeriodoDa),
        dataPeriodoA: parseOptionalString(request.query.dataPeriodoA),
        idAbilitato: parseOptionalPositiveInt(request.query.idAbilitato, 'idAbilitato'),
      }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async setReso(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const params: QdcSetResoFertilizzanteParams = {
      idAzienda: parsePositiveInt(request.body?.idAzienda, 'idAzienda'),
      dataReso: parseRequiredString(request.body?.dataReso, 'dataReso'),
      idAbilitato: parsePositiveInt(request.body?.idAbilitato, 'idAbilitato'),
      qta: parseFiniteNumber(request.body?.qta, 'qta'),
      udm: parseFertilizzanteUdm(request.body?.udm),
      tipoScarico: parseTipoScarico(request.body?.tipoScarico),
      note: parseOptionalString(request.body?.note),
    };
    const payload = await runQdcWrite(userId, 'setResoFertilizzante', params, (api) =>
      api.magazzinoFertilizzanti.setResoFertilizzante(params),
    );
    return sendQdcEnvelope(response, payload);
  }

  async delReso(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parseIdAziendaFrom(request);
    const idReso = parsePositiveInt(request.params.idReso, 'idReso');
    const payload = await runQdcWrite(
      userId,
      'delResoFertilizzante',
      { idAzienda, idReso },
      (api) => api.magazzinoFertilizzanti.delResoFertilizzante({ idAzienda, idReso }),
    );
    return sendQdcEnvelope(response, payload);
  }
}
