import { QdcImageLineRestApi } from '../infrastructure/services/integrations/qdc_imageline';
import type {
  QdcApiResponse,
  QdcGetOperazioniParams,
  QdcTableResult,
} from '../infrastructure/services/integrations/qdc_imageline';

function buildFetchMock(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ message: 'ok', result: { COLUMNS: [], DATA: [] } }),
  });
}

function buildApi(fetchMock: jest.Mock): QdcImageLineRestApi {
  const api = new QdcImageLineRestApi({ fetchImpl: fetchMock as unknown as typeof fetch });
  api.setAccessToken('test-token');
  return api;
}

const inputPeriodParams: QdcGetOperazioniParams = {
  idAzienda: 42,
  dataPeriodoDa: '01/01/2026',
  dataPeriodoA: '30/06/2026',
  listaIdUnita: [5, 6],
  idColtura: 9,
};

type OperazioneCall = (api: QdcImageLineRestApi) => Promise<QdcApiResponse<QdcTableResult>>;

const campoCases: ReadonlyArray<[string, OperazioneCall]> = [
  ['/gettrattamenti', (api) => api.operazioniCampo.getTrattamenti(inputPeriodParams)],
  ['/getfertilizzazioni', (api) => api.operazioniCampo.getFertilizzazioni(inputPeriodParams)],
  ['/getlanciausiliari', (api) => api.operazioniCampo.getLanciAusiliari(inputPeriodParams)],
  ['/getirrigazioni', (api) => api.operazioniCampo.getIrrigazioni(inputPeriodParams)],
  ['/getraccolte', (api) => api.operazioniCampo.getRaccolte(inputPeriodParams)],
  ['/getsemine', (api) => api.operazioniCampo.getSemine(inputPeriodParams)],
  ['/gettrapianti', (api) => api.operazioniCampo.getTrapianti(inputPeriodParams)],
  ['/getsovesci', (api) => api.operazioniCampo.getSovesci(inputPeriodParams)],
  ['/getispezionicampo', (api) => api.operazioniCampo.getIspezioniCampo(inputPeriodParams)],
];

describe('QdcOperazioniCampoApi', () => {
  it.each(campoCases)(
    'calls %s with company, period, unit and crop filters',
    async (expectedPath, call) => {
      const fetchMock = buildFetchMock();
      await call(buildApi(fetchMock));
      const actualUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
      expect(actualUrl).toContain(`${expectedPath}?`);
      expect(actualUrl).toContain('id_azienda=42');
      expect(actualUrl).toContain('data_periododa=01%2F01%2F2026');
      expect(actualUrl).toContain('data_periodoa=30%2F06%2F2026');
      expect(actualUrl).toContain('lista_id_unita=5%2C6');
      expect(actualUrl).toContain('id_coltura=9');
    },
  );

  it('omits optional filters when not provided', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).operazioniCampo.getTrattamenti({ idAzienda: 42 });
    const actualUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
    expect(actualUrl).toContain('id_azienda=42');
    expect(actualUrl).not.toContain('data_periododa');
    expect(actualUrl).not.toContain('lista_id_unita');
    expect(actualUrl).not.toContain('id_coltura');
  });
});

describe('QdcOperazioniRegistroApi', () => {
  it('calls /getaltreoperazioni including the operation-type filter', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).operazioniRegistro.getAltreOperazioni({
      ...inputPeriodParams,
      tipoOperazioneId: 3,
    });
    const actualUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
    expect(actualUrl).toContain('/getaltreoperazioni?');
    expect(actualUrl).toContain('tipo_operazione_id=3');
    expect(actualUrl).toContain('lista_id_unita=5%2C6');
  });

  it.each([
    ['/getconcesementi', 'getConceSementi' as const],
    ['/getsmaltimentirifiuti', 'getSmaltimentiRifiuti' as const],
    ['/getoperazionieliminate', 'getOperazioniEliminate' as const],
  ])('calls %s with company and period only', async (expectedPath, method) => {
    const fetchMock = buildFetchMock();
    const api = buildApi(fetchMock);
    await api.operazioniRegistro[method]({
      idAzienda: 42,
      dataPeriodoDa: '01/01/2026',
      dataPeriodoA: '30/06/2026',
    });
    const actualUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
    expect(actualUrl).toContain(`${expectedPath}?`);
    expect(actualUrl).toContain('id_azienda=42');
    expect(actualUrl).toContain('data_periododa=01%2F01%2F2026');
    expect(actualUrl).toContain('data_periodoa=30%2F06%2F2026');
  });
});
