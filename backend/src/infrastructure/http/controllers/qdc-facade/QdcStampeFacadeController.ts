import type { Request, Response } from 'express';
import { parseIdAziendaFrom, parseOptionalPositiveInt } from '../../qdc-facade/qdc-facade-params';
import { runQdcRead, sendQdcEnvelope } from '../../qdc-facade/qdc-facade-response';
import { requireQdcUserId } from '../../qdc-facade/require-qdc-user';

/**
 * REST facade over QdcStampeApi (treatment-register PDFs).
 */
export class QdcStampeFacadeController {
  async getRegistroTrattamenti(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const payload = await runQdcRead(userId, (api) =>
      api.stampe.getRegistroTrattamenti({
        idAzienda: parseIdAziendaFrom(request),
        elementi: parseOptionalPositiveInt(request.query.elementi, 'elementi'),
      }),
    );
    return sendQdcEnvelope(response, payload);
  }
}
