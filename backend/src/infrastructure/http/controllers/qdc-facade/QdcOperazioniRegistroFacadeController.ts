import type { Request, Response } from 'express';
import { AppError } from '../../../../domain/errors/AppError';
import type {
  QdcGetAltreOperazioniParams,
  QdcPeriodoParams,
} from '../../../services/integrations/qdc_imageline';
import {
  parseIdAziendaFrom,
  parseIdList,
  parseOptionalPositiveInt,
  parseOptionalString,
} from '../../qdc-facade/qdc-facade-params';
import { runQdcRead, sendQdcEnvelope } from '../../qdc-facade/qdc-facade-response';
import { requireQdcUserId } from '../../qdc-facade/require-qdc-user';

const REGISTRO_TIPI = ['altre', 'conce-sementi', 'smaltimenti-rifiuti', 'eliminate'] as const;
type RegistroTipo = (typeof REGISTRO_TIPI)[number];

function isRegistroTipo(value: string): value is RegistroTipo {
  return (REGISTRO_TIPI as readonly string[]).includes(value);
}

function periodoFromQuery(request: Request): QdcPeriodoParams {
  return {
    idAzienda: parseIdAziendaFrom(request),
    dataPeriodoDa: parseOptionalString(request.query.dataPeriodoDa),
    dataPeriodoA: parseOptionalString(request.query.dataPeriodoA),
  };
}

/**
 * REST facade over QdcOperazioniRegistroApi.
 */
export class QdcOperazioniRegistroFacadeController {
  async getByTipo(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const tipo = String(request.params.tipo ?? '');
    if (!isRegistroTipo(tipo)) {
      throw AppError.badRequest(
        `Unknown register operation type. Use one of: ${REGISTRO_TIPI.join(', ')}`,
        'INVALID_PARAM',
      );
    }
    const periodo = periodoFromQuery(request);
    const altreParams: QdcGetAltreOperazioniParams = {
      ...periodo,
      listaIdUnita: parseIdList(request.query.listaIdUnita),
      idColtura: parseOptionalPositiveInt(request.query.idColtura, 'idColtura'),
      tipoOperazioneId: parseOptionalPositiveInt(
        request.query.tipoOperazioneId,
        'tipoOperazioneId',
      ),
    };
    const payload = await runQdcRead(userId, (api) => {
      switch (tipo) {
        case 'altre':
          return api.operazioniRegistro.getAltreOperazioni(altreParams);
        case 'conce-sementi':
          return api.operazioniRegistro.getConceSementi(periodo);
        case 'smaltimenti-rifiuti':
          return api.operazioniRegistro.getSmaltimentiRifiuti(periodo);
        case 'eliminate':
          return api.operazioniRegistro.getOperazioniEliminate(periodo);
      }
    });
    return sendQdcEnvelope(response, payload);
  }
}
