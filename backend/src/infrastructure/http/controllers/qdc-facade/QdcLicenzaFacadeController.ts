import type { Request, Response } from 'express';
import { getAllCompanies } from '../../../services/integrations/qdc_imageline';
import {
  parseIdAziendaFrom,
  parseOptionalBoolean,
  parsePositiveInt,
} from '../../qdc-facade/qdc-facade-params';
import {
  runQdcRead,
  runQdcWrite,
  sendQdcEnvelope,
  sendSuccess,
} from '../../qdc-facade/qdc-facade-response';
import { requireQdcUserId } from '../../qdc-facade/require-qdc-user';

/**
 * REST facade over QdcLicenzaApi (license, companies, technicians, deadlines).
 */
export class QdcLicenzaFacadeController {
  async getLicenzaInfo(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) => api.licenza.getLicenzaInfo());
    return sendQdcEnvelope(response, payload);
  }

  async getAziende(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const mostraDisabilitate =
      parseOptionalBoolean(request.query.mostraDisabilitate, 'mostraDisabilitate') ?? false;
    const companies = await runQdcRead(userId, (api) => getAllCompanies(api, mostraDisabilitate));
    return sendSuccess(response, { count: companies.length, companies });
  }

  async getAzienda(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parsePositiveInt(request.params.idAzienda, 'idAzienda');
    const payload = await runQdcRead(userId, (api) => api.licenza.getAzienda(idAzienda));
    return sendQdcEnvelope(response, payload);
  }

  async getTecnici(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) => api.licenza.getLicenzaTecnici());
    return sendQdcEnvelope(response, payload);
  }

  async getAssociazioni(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) => api.licenza.getLicenzaAssociazioni());
    return sendQdcEnvelope(response, payload);
  }

  async setAssociazione(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parsePositiveInt(request.body?.idAzienda, 'idAzienda');
    const idTecnico = parsePositiveInt(request.body?.idTecnico, 'idTecnico');
    const payload = await runQdcWrite(
      userId,
      'setLicenzaAssociazione',
      { idAzienda, idTecnico },
      (api) => api.licenza.setLicenzaAssociazione({ idAzienda, idTecnico }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async delAssociazione(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parsePositiveInt(
      request.query.idAzienda ?? request.body?.idAzienda,
      'idAzienda',
    );
    const idTecnico = parsePositiveInt(
      request.query.idTecnico ?? request.body?.idTecnico,
      'idTecnico',
    );
    const payload = await runQdcWrite(
      userId,
      'delLicenzaAssociazione',
      { idAzienda, idTecnico },
      (api) => api.licenza.delLicenzaAssociazione({ idAzienda, idTecnico }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async getScadenze(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAzienda = parseIdAziendaFrom(request);
    const payload = await runQdcRead(userId, (api) => api.licenza.getScadenze(idAzienda));
    return sendSuccess(response, payload);
  }
}
