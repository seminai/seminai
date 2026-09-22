import { QdcImageLineRestApi } from '../infrastructure/services/integrations/qdc_imageline';

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

function calledUrl(fetchMock: jest.Mock): string {
  return (fetchMock.mock.calls[0]?.[0] ?? '') as string;
}

describe('QdcLicenzaApi.getScadenze', () => {
  it('calls /getscadenze with the company id', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).licenza.getScadenze(42);
    expect(calledUrl(fetchMock)).toContain('/getscadenze?');
    expect(calledUrl(fetchMock)).toContain('id_azienda=42');
  });
});

describe('QdcColtureApi', () => {
  it('calls /getunita mapping every optional filter to its snake_case param', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).colture.getUnita({
      idAzienda: 42,
      anno: 2026,
      listaIdUnita: [11, 12],
      idColtura: 9,
      daConfermare: true,
      codice: 'U01',
      codiceEsterno: 'EXT-01',
      dataRifSuperficie: '01/06/2026',
      inizioAnnataAgraria: '01/11/2025',
    });
    const actualUrl = calledUrl(fetchMock);
    expect(actualUrl).toContain('/getunita?');
    expect(actualUrl).toContain('id_azienda=42');
    expect(actualUrl).toContain('anno=2026');
    expect(actualUrl).toContain('lista_id_unita=11%2C12');
    expect(actualUrl).toContain('id_coltura=9');
    expect(actualUrl).toContain('daconfermare=true');
    expect(actualUrl).toContain('codice=U01');
    expect(actualUrl).toContain('codiceesterno=EXT-01');
    expect(actualUrl).toContain('datarif_superficie=01%2F06%2F2026');
    expect(actualUrl).toContain('inizioannataagraria=01%2F11%2F2025');
  });

  it('calls /getconferimenti with company and period', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).colture.getConferimenti({
      idAzienda: 42,
      dataPeriodoDa: '01/01/2026',
      dataPeriodoA: '30/06/2026',
    });
    const actualUrl = calledUrl(fetchMock);
    expect(actualUrl).toContain('/getconferimenti?');
    expect(actualUrl).toContain('id_azienda=42');
    expect(actualUrl).toContain('data_periododa=01%2F01%2F2026');
    expect(actualUrl).toContain('data_periodoa=30%2F06%2F2026');
  });
});

describe('QdcStampeApi', () => {
  it('calls /getregistrotrattamenti with the last-N filter', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).stampe.getRegistroTrattamenti({ idAzienda: 42, elementi: 3 });
    const actualUrl = calledUrl(fetchMock);
    expect(actualUrl).toContain('/getregistrotrattamenti?');
    expect(actualUrl).toContain('id_azienda=42');
    expect(actualUrl).toContain('elementi=3');
  });
});

describe('QdcProdottiFertilizzantiApi.prodottoAssegnaCodice', () => {
  it('calls /prodottoassegnacodice with product id and external code', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).prodottiFertilizzanti.prodottoAssegnaCodice({
      idAbilitato: 10,
      codiceEsterno: 'XA001 B2',
    });
    const actualUrl = calledUrl(fetchMock);
    expect(actualUrl).toContain('/prodottoassegnacodice?');
    expect(actualUrl).toContain('id_abilitato=10');
    expect(actualUrl).toContain('codice_esterno=XA001+B2');
  });
});

describe('QdcMagazzinoAgrofarmaciApi.setCaricoAgrofarmaco', () => {
  it('form-encodes the load registration with camelCase params mapped to snake_case', async () => {
    const fetchMock = buildFetchMock();
    await buildApi(fetchMock).magazzinoAgrofarmaci.setCaricoAgrofarmaco({
      idAzienda: 42,
      dataCarico: '15/06/2026',
      numreg: 12345,
      qta: 2.5,
      udm: 'KG',
      fornitoreNome: 'Consorzio Agrario',
    });
    const actualBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string;
    const actualParams = new URLSearchParams(actualBody);
    expect(actualParams.get('id_azienda')).toBe('42');
    expect(actualParams.get('data_carico')).toBe('15/06/2026');
    expect(actualParams.get('numreg')).toBe('12345');
    expect(actualParams.get('qta')).toBe('2.5');
    expect(actualParams.get('udm')).toBe('KG');
    expect(actualParams.get('fornitore_nome')).toBe('Consorzio Agrario');
    expect(actualParams.has('note')).toBe(false);
  });
});
