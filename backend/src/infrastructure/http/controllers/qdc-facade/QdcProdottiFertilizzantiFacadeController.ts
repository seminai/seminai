import type { Request, Response } from 'express';
import type {
  QdcNuovoFertilizzanteParams,
  QdcRicercaFertilizzantiParams,
} from '../../../services/integrations/qdc_imageline';
import {
  parseOptionalBoolean,
  parseOptionalPositiveInt,
  parsePositiveInt,
  parseRequiredString,
  parseTipoFertilizzante,
} from '../../qdc-facade/qdc-facade-params';
import { runQdcRead, runQdcWrite, sendQdcEnvelope } from '../../qdc-facade/qdc-facade-response';
import { requireQdcUserId } from '../../qdc-facade/require-qdc-user';

/**
 * REST facade over QdcProdottiFertilizzantiApi.
 */
export class QdcProdottiFertilizzantiFacadeController {
  async search(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const params: QdcRicercaFertilizzantiParams = {
      ricerca: parseRequiredString(request.query.ricerca, 'ricerca'),
      idAzienda: parseOptionalPositiveInt(request.query.idAzienda, 'idAzienda'),
      utilizzati: parseOptionalBoolean(request.query.utilizzati, 'utilizzati'),
      abilitati: parseOptionalBoolean(request.query.abilitati, 'abilitati'),
      perPag: parseOptionalPositiveInt(request.query.perPag, 'perPag'),
      numPag: parseOptionalPositiveInt(request.query.numPag, 'numPag'),
    };
    const payload = await runQdcRead(userId, (api) =>
      api.prodottiFertilizzanti.getRicercaFertilizzanti(params),
    );
    return sendQdcEnvelope(response, payload);
  }

  async abilita(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const prodKey = parseRequiredString(request.body?.prodKey, 'prodKey');
    const payload = await runQdcWrite(userId, 'prodottoAbilita', { prodKey }, (api) =>
      api.prodottiFertilizzanti.prodottoAbilita(prodKey),
    );
    return sendQdcEnvelope(response, payload);
  }

  async assegnaCodice(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const idAbilitato = parsePositiveInt(request.body?.idAbilitato, 'idAbilitato');
    const codiceEsterno = parseRequiredString(request.body?.codiceEsterno, 'codiceEsterno');
    const payload = await runQdcWrite(
      userId,
      'prodottoAssegnaCodice',
      { idAbilitato, codiceEsterno },
      (api) => api.prodottiFertilizzanti.prodottoAssegnaCodice({ idAbilitato, codiceEsterno }),
    );
    return sendQdcEnvelope(response, payload);
  }

  async setNuovo(request: Request, response: Response): Promise<Response> {
    const userId = requireQdcUserId(request);
    const params: QdcNuovoFertilizzanteParams = {
      nome: parseRequiredString(request.body?.nome, 'nome'),
      bio: parseOptionalBoolean(request.body?.bio, 'bio') ?? false,
      tipo: parseTipoFertilizzante(request.body?.tipo),
    };
    const payload = await runQdcWrite(userId, 'setNuovoFertilizzante', params, (api) =>
      api.prodottiFertilizzanti.setNuovoFertilizzante(params),
    );
    return sendQdcEnvelope(response, payload);
  }
}
