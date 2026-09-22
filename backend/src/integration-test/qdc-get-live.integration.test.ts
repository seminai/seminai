import dotenv from 'dotenv';
dotenv.config();

import {
  getHistoryDateRange,
  getQdcApiFromClientId,
  getTodayIT,
  parseTableToRecords,
  QdcApiError,
} from '../infrastructure/services/integrations/qdc_imageline';
import type {
  QdcApiResponse,
  QdcImageLineRestApi,
  QdcTableResult,
} from '../infrastructure/services/integrations/qdc_imageline';

/**
 * Live GET-only smoke of every mapped Image Line read endpoint.
 * Never calls write endpoints (set, del, prodottoAbilita, prodottoAssegnaCodice).
 */
const clientId = process.env.QDC_TEST_CLIENT_ID || process.env.IMAGE_LINE_CLIENT_ID;
const describeOrSkip = clientId ? describe : describe.skip;

function expectRecordsetShape(result: QdcTableResult | undefined): void {
  if (!result) {
    return;
  }
  const columns = result.COLUMNS ?? result.columns;
  const data = result.DATA ?? result.data;
  expect(Array.isArray(columns)).toBe(true);
  expect(Array.isArray(data)).toBe(true);
}

function expectMessage(payload: QdcApiResponse): void {
  expect(payload.message).toBeDefined();
}

function expectEnvelope(payload: QdcApiResponse<QdcTableResult>): void {
  expectMessage(payload);
  expectRecordsetShape(payload.result);
}

function isMissingScope(error: unknown, scope: string): boolean {
  return (
    error instanceof QdcApiError &&
    error.httpStatus === 403 &&
    (error.errorDescription ?? error.message).includes(scope)
  );
}

describeOrSkip('QDC ImageLine GET-only live reads', () => {
  jest.setTimeout(120_000);
  let api: QdcImageLineRestApi;
  let idAzienda: number;
  const range = getHistoryDateRange(30);
  const today = getTodayIT();
  const anno = new Date().getFullYear();

  beforeAll(async () => {
    api = await getQdcApiFromClientId(clientId!);
    const aziende = await api.licenza.getLicenzaAziende();
    const records = parseTableToRecords(aziende.result);
    const first = records[0];
    if (!first || first.ID == null) {
      throw new Error('QDC license has no companies — cannot run company-scoped GET tests');
    }
    idAzienda = Number(first.ID);
  });

  it('reads license registry (info, companies, technicians, associations)', async () => {
    expectMessage(await api.licenza.getLicenzaInfo());
    expectEnvelope(await api.licenza.getLicenzaAziende());
    expectMessage(await api.licenza.getAzienda(idAzienda));
    expectEnvelope(await api.licenza.getLicenzaTecnici());
    expectEnvelope(await api.licenza.getLicenzaAssociazioni());
  });

  it('reads scadenze, units, conferimenti and treatment-register prints', async () => {
    const scadenze = await api.licenza.getScadenze(idAzienda);
    expect(Array.isArray(scadenze.patentini)).toBe(true);
    expect(Array.isArray(scadenze.tarature)).toBe(true);
    expectEnvelope(await api.colture.getUnita({ idAzienda, anno }));
    try {
      expectEnvelope(
        await api.colture.getConferimenti({
          idAzienda,
          dataPeriodoDa: range.dataDa,
          dataPeriodoA: range.dataA,
        }),
      );
    } catch (error) {
      if (!isMissingScope(error, 'r_conferimenti')) {
        throw error;
      }
      console.warn('[qdc] skipping getConferimenti: license lacks r_conferimenti');
    }
    expectEnvelope(await api.stampe.getRegistroTrattamenti({ idAzienda, elementi: 1 }));
  });

  it('reads every field-operation GET endpoint', async () => {
    const params = {
      idAzienda,
      dataPeriodoDa: range.dataDa,
      dataPeriodoA: range.dataA,
    };
    expectEnvelope(await api.operazioniCampo.getTrattamenti(params));
    expectEnvelope(await api.operazioniCampo.getFertilizzazioni(params));
    expectEnvelope(await api.operazioniCampo.getLanciAusiliari(params));
    expectEnvelope(await api.operazioniCampo.getIrrigazioni(params));
    expectEnvelope(await api.operazioniCampo.getRaccolte(params));
    expectEnvelope(await api.operazioniCampo.getSemine(params));
    expectEnvelope(await api.operazioniCampo.getTrapianti(params));
    expectEnvelope(await api.operazioniCampo.getSovesci(params));
    expectEnvelope(await api.operazioniCampo.getIspezioniCampo(params));
  });

  it('reads every register-operation GET endpoint', async () => {
    const params = {
      idAzienda,
      dataPeriodoDa: range.dataDa,
      dataPeriodoA: range.dataA,
    };
    expectEnvelope(await api.operazioniRegistro.getAltreOperazioni(params));
    expectEnvelope(await api.operazioniRegistro.getConceSementi(params));
    expectEnvelope(await api.operazioniRegistro.getSmaltimentiRifiuti(params));
    expectEnvelope(await api.operazioniRegistro.getOperazioniEliminate(params));
  });

  it('reads warehouse stock and movement history (no writes)', async () => {
    expectEnvelope(
      await api.magazzinoAgrofarmaci.getGiacenzeAgrofarmaci({ idAzienda, data: today }),
    );
    expectEnvelope(
      await api.magazzinoAgrofarmaci.getCarichiAgrofarmaci({
        idAzienda,
        dataPeriodoDa: range.dataDa,
        dataPeriodoA: range.dataA,
      }),
    );
    expectEnvelope(
      await api.magazzinoAgrofarmaci.getResiAgrofarmaci({
        idAzienda,
        dataPeriodoDa: range.dataDa,
        dataPeriodoA: range.dataA,
      }),
    );
    expectEnvelope(
      await api.magazzinoFertilizzanti.getGiacenzeFertilizzanti({ idAzienda, data: today }),
    );
    expectEnvelope(
      await api.magazzinoFertilizzanti.getCarichiFertilizzanti({
        idAzienda,
        dataPeriodoDa: range.dataDa,
        dataPeriodoA: range.dataA,
      }),
    );
    expectEnvelope(
      await api.magazzinoFertilizzanti.getResiFertilizzanti({
        idAzienda,
        dataPeriodoDa: range.dataDa,
        dataPeriodoA: range.dataA,
      }),
    );
  });

  it('searches fertilizer products (catalog GET)', async () => {
    expectEnvelope(
      await api.prodottiFertilizzanti.getRicercaFertilizzanti({
        ricerca: 'urea',
        idAzienda,
        perPag: 10,
        numPag: 1,
      }),
    );
  });
});
