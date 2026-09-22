import type { Request, Response } from 'express';
import type {
  QdcSetCaricoAgrofarmacoParams,
  QdcSetResoAgrofarmacoParams,
} from '../../../services/integrations/qdc_imageline';
import { getTodayIT } from '../../../services/integrations/qdc_imageline';
import {
  parseAgrofarmacoUdm,
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
 * REST facade over QdcMagazzinoAgrofarmaciApi.
 */
export class QdcMagazzinoAgrofarmaciFacadeController {
  async getGiacenze(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parseIdAziendaFrom(request);
    const data = parseOptionalString(request.query.data) ?? getTodayIT();
    const numreg = parseOptionalPositiveInt(request.query.numreg, 'numreg');
    const payload = await runQdcRead(userId, (api) =>
      api.magazzinoAgrofarmaci.getGiacenzeAgrofarmaci({ idAzienda, data, numreg }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async getCarichi(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) =>
      api.magazzinoAgrofarmaci.getCarichiAgrofarmaci({
        idAzienda: parseIdAziendaFrom(request),
        dataPeriodoDa: parseOptionalString(request.query.dataPeriodoDa),
        dataPeriodoA: parseOptionalString(request.query.dataPeriodoA),
        numreg: parseOptionalPositiveInt(request.query.numreg, 'numreg'),
      }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async setCarico(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const params: QdcSetCaricoAgrofarmacoParams = {
      idAzienda: parsePositiveInt(request.body?.idAzienda, 'idAzienda'),
      dataCarico: parseRequiredString(request.body?.dataCarico, 'dataCarico'),
      numreg: parsePositiveInt(request.body?.numreg, 'numreg'),
      qta: parseFiniteNumber(request.body?.qta, 'qta'),
      udm: parseAgrofarmacoUdm(request.body?.udm),
      numeroFattura: parseOptionalString(request.body?.numeroFattura),
      dataFattura: parseOptionalString(request.body?.dataFattura),
      note: parseOptionalString(request.body?.note),
      fornitoreNome: parseOptionalString(request.body?.fornitoreNome),
      fornitoreQualifica: parseOptionalString(request.body?.fornitoreQualifica),
    };
    const payload = await runQdcWrite(userId, 'setCaricoAgrofarmaco', params, (api) =>
      api.magazzinoAgrofarmaci.setCaricoAgrofarmaco(params),
    );
    return sendQdcEnvelope(response, payload);
  }

  async delCarico(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parseIdAziendaFrom(request);
    const idCarico = parsePositiveInt(request.params.idCarico, 'idCarico');
    const payload = await runQdcWrite(
      userId,
      'delCaricoAgrofarmaco',
      { idAzienda, idCarico },
      (api) => api.magazzinoAgrofarmaci.delCaricoAgrofarmaco({ idAzienda, idCarico }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async getResi(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) =>
      api.magazzinoAgrofarmaci.getResiAgrofarmaci({
        idAzienda: parseIdAziendaFrom(request),
        dataPeriodoDa: parseOptionalString(request.query.dataPeriodoDa),
        dataPeriodoA: parseOptionalString(request.query.dataPeriodoA),
        numreg: parseOptionalPositiveInt(request.query.numreg, 'numreg'),
      }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async setReso(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const params: QdcSetResoAgrofarmacoParams = {
      idAzienda: parsePositiveInt(request.body?.idAzienda, 'idAzienda'),
      dataReso: parseRequiredString(request.body?.dataReso, 'dataReso'),
      numreg: parsePositiveInt(request.body?.numreg, 'numreg'),
      qta: parseFiniteNumber(request.body?.qta, 'qta'),
      udm: parseAgrofarmacoUdm(request.body?.udm),
      tipoScarico: parseTipoScarico(request.body?.tipoScarico),
      note: parseOptionalString(request.body?.note),
    };
    const payload = await runQdcWrite(userId, 'setResoAgrofarmaco', params, (api) =>
      api.magazzinoAgrofarmaci.setResoAgrofarmaco(params),
    );
    return sendQdcEnvelope(response, payload);
  }

  async delReso(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parseIdAziendaFrom(request);
    const idReso = parsePositiveInt(request.params.idReso, 'idReso');
    const payload = await runQdcWrite(userId, 'delResoAgrofarmaco', { idAzienda, idReso }, (api) =>
      api.magazzinoAgrofarmaci.delResoAgrofarmaco({ idAzienda, idReso }),
    );
    return sendQdcEnvelope(response, payload);
  }
}
