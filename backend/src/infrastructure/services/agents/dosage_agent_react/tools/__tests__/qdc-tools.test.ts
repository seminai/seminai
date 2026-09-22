import { createQdcGetGiacenzeTool } from '../qdc/qdc-get-giacenze.tool';
import { createQdcGetOperationsTool } from '../qdc/qdc-get-operations.tool';
import { createQdcListCompaniesTool } from '../qdc/qdc-list-companies.tool';
import { getQdcClientIdForUser } from '../qdc/require-qdc';
import {
  getAllCompanies,
  getQdcApiFromClientId,
  QdcImageLineRestApi,
} from '../../../../integrations/qdc_imageline';

jest.mock('../qdc/require-qdc', () => ({
  ...jest.requireActual('../qdc/require-qdc'),
  getQdcClientIdForUser: jest.fn(),
}));

jest.mock('../../../../integrations/qdc_imageline', () => ({
  ...jest.requireActual('../../../../integrations/qdc_imageline'),
  getQdcApiFromClientId: jest.fn(),
  getAllCompanies: jest.fn(),
}));

const mockGetClientId = getQdcClientIdForUser as jest.MockedFunction<typeof getQdcClientIdForUser>;
const mockGetApi = getQdcApiFromClientId as jest.MockedFunction<typeof getQdcApiFromClientId>;
const mockGetAllCompanies = getAllCompanies as jest.MockedFunction<typeof getAllCompanies>;

const USER_ID = 'user-1';

interface FakeApi {
  operazioniCampo: { getTrattamenti: jest.Mock; getIrrigazioni: jest.Mock };
  operazioniRegistro: { getAltreOperazioni: jest.Mock };
  magazzinoAgrofarmaci: { getGiacenzeAgrofarmaci: jest.Mock };
  magazzinoFertilizzanti: { getGiacenzeFertilizzanti: jest.Mock };
}

function buildFakeApi(): FakeApi {
  const tableResponse = {
    message: 'ok',
    result: { COLUMNS: ['ID', 'PRODOTTO'], DATA: [[1, 'Rame 20']] },
  };
  return {
    operazioniCampo: {
      getTrattamenti: jest.fn().mockResolvedValue(tableResponse),
      getIrrigazioni: jest.fn().mockResolvedValue(tableResponse),
    },
    operazioniRegistro: { getAltreOperazioni: jest.fn().mockResolvedValue(tableResponse) },
    magazzinoAgrofarmaci: { getGiacenzeAgrofarmaci: jest.fn().mockResolvedValue(tableResponse) },
    magazzinoFertilizzanti: {
      getGiacenzeFertilizzanti: jest.fn().mockResolvedValue(tableResponse),
    },
  };
}

function stubApi(fake: FakeApi): void {
  mockGetApi.mockResolvedValue(fake as unknown as QdcImageLineRestApi);
}

describe('QDC agent tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClientId.mockResolvedValue('client-1');
  });

  describe('qdc_list_companies', () => {
    it('returns a structured disabled message when the QDC client id is missing', async () => {
      mockGetClientId.mockResolvedValue(null);
      const tool = createQdcListCompaniesTool(USER_ID);
      const actualOutput = JSON.parse(await tool.invoke({ includiDisabilitate: false }));
      expect(actualOutput.available).toBe(false);
      expect(actualOutput.reason).toContain('Quaderno di Campagna');
      expect(mockGetApi).not.toHaveBeenCalled();
    });

    it('returns the license companies when configured', async () => {
      stubApi(buildFakeApi());
      const expectedCompanies = [
        {
          id: 1,
          azienda: 'Az. Agr. Rossi',
          piva: '01234567890',
          cf: 'RSSMRA',
          validaDa: '',
          validaA: '',
          disabilitata: false,
        },
      ];
      mockGetAllCompanies.mockResolvedValue(expectedCompanies);
      const tool = createQdcListCompaniesTool(USER_ID);
      const actualOutput = JSON.parse(await tool.invoke({ includiDisabilitate: false }));
      expect(actualOutput.available).toBe(true);
      expect(actualOutput.count).toBe(1);
      expect(actualOutput.companies).toEqual(expectedCompanies);
    });
  });

  describe('qdc_get_operations', () => {
    it('dispatches tipo=trattamenti to operazioniCampo.getTrattamenti with mapped params', async () => {
      const fakeApi = buildFakeApi();
      stubApi(fakeApi);
      const tool = createQdcGetOperationsTool(USER_ID);
      const actualOutput = JSON.parse(
        await tool.invoke({
          idAzienda: 42,
          tipo: 'trattamenti',
          dataDa: '01/01/2026',
          dataA: '30/06/2026',
        }),
      );
      expect(fakeApi.operazioniCampo.getTrattamenti).toHaveBeenCalledWith({
        idAzienda: 42,
        dataPeriodoDa: '01/01/2026',
        dataPeriodoA: '30/06/2026',
        idColtura: undefined,
      });
      expect(actualOutput.available).toBe(true);
      expect(actualOutput.count).toBe(1);
      expect(actualOutput.operations[0]).toEqual({ ID: 1, PRODOTTO: 'Rame 20' });
    });

    it('dispatches tipo=altreoperazioni to operazioniRegistro.getAltreOperazioni', async () => {
      const fakeApi = buildFakeApi();
      stubApi(fakeApi);
      const tool = createQdcGetOperationsTool(USER_ID);
      await tool.invoke({ idAzienda: 42, tipo: 'altreoperazioni' });
      expect(fakeApi.operazioniRegistro.getAltreOperazioni).toHaveBeenCalledTimes(1);
      expect(fakeApi.operazioniCampo.getTrattamenti).not.toHaveBeenCalled();
    });

    it('returns a structured failure when the QDC API rejects', async () => {
      const fakeApi = buildFakeApi();
      fakeApi.operazioniCampo.getIrrigazioni.mockRejectedValue(new Error('invalid_client'));
      stubApi(fakeApi);
      const tool = createQdcGetOperationsTool(USER_ID);
      const actualOutput = JSON.parse(await tool.invoke({ idAzienda: 42, tipo: 'irrigazioni' }));
      expect(actualOutput.available).toBe(false);
      expect(actualOutput.reason).toContain('invalid_client');
    });
  });

  describe('qdc_get_giacenze', () => {
    it('routes categoria=fertilizzanti to the fertilizer warehouse defaulting the date to today', async () => {
      const fakeApi = buildFakeApi();
      stubApi(fakeApi);
      const tool = createQdcGetGiacenzeTool(USER_ID);
      const actualOutput = JSON.parse(
        await tool.invoke({ idAzienda: 42, categoria: 'fertilizzanti' }),
      );
      const actualCall = fakeApi.magazzinoFertilizzanti.getGiacenzeFertilizzanti.mock.calls[0]?.[0];
      expect(actualCall.idAzienda).toBe(42);
      expect(actualCall.data).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(fakeApi.magazzinoAgrofarmaci.getGiacenzeAgrofarmaci).not.toHaveBeenCalled();
      expect(actualOutput.available).toBe(true);
      expect(actualOutput.giacenze[0]).toEqual({ ID: 1, PRODOTTO: 'Rame 20' });
    });

    it('routes categoria=agrofarmaci to the pesticide warehouse honoring the explicit date', async () => {
      const fakeApi = buildFakeApi();
      stubApi(fakeApi);
      const tool = createQdcGetGiacenzeTool(USER_ID);
      await tool.invoke({ idAzienda: 42, categoria: 'agrofarmaci', data: '15/06/2026' });
      expect(fakeApi.magazzinoAgrofarmaci.getGiacenzeAgrofarmaci).toHaveBeenCalledWith({
        idAzienda: 42,
        data: '15/06/2026',
      });
    });
  });
});
