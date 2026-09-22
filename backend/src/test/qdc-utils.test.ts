import {
  getAllCompanies,
  getCompanyIdByName,
  getCompanyIdByVatNumber,
  QdcImageLineRestApi,
} from '../infrastructure/services/integrations/qdc_imageline';
import type { QdcTableResult } from '../infrastructure/services/integrations/qdc_imageline';

function buildApiWithAziende(result: QdcTableResult): QdcImageLineRestApi {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ message: 'ok', result }),
  });
  const api = new QdcImageLineRestApi({ fetchImpl: fetchMock as unknown as typeof fetch });
  api.setAccessToken('test-token');
  return api;
}

// Real-world layout observed live: DISABILITATA is absent when disabled
// companies are filtered out server-side.
const inputAziende: QdcTableResult = {
  COLUMNS: ['ID', 'AZIENDA', 'PIVA', 'CF', 'VALIDADA', 'VALIDAA'],
  DATA: [
    [456205, 'ANCARANI ALIDE', '01065130393', 'NCRLDA51D61D458H', '28/03/2024', '28/03/2027'],
    [453581, 'AZIENDA PROVA', '00240600395', '', '28/03/2024', '28/03/2027'],
  ],
};

describe('getAllCompanies', () => {
  it('maps companies by column name, defaulting disabilitata when the column is absent', async () => {
    const actualCompanies = await getAllCompanies(buildApiWithAziende(inputAziende));
    expect(actualCompanies).toHaveLength(2);
    expect(actualCompanies[0]).toEqual({
      id: 456205,
      azienda: 'ANCARANI ALIDE',
      piva: '01065130393',
      cf: 'NCRLDA51D61D458H',
      validaDa: '28/03/2024',
      validaA: '28/03/2027',
      disabilitata: false,
    });
  });

  it('parses DISABILITATA robustly when present, regardless of column order', async () => {
    const inputShuffled: QdcTableResult = {
      COLUMNS: ['DISABILITATA', 'ID', 'AZIENDA', 'PIVA', 'CF', 'VALIDADA', 'VALIDAA'],
      DATA: [
        ['false', 1, 'A', '1', '', '', ''],
        ['true', 2, 'B', '2', '', '', ''],
        [1, 3, 'C', '3', '', '', ''],
      ],
    };
    const actualCompanies = await getAllCompanies(buildApiWithAziende(inputShuffled), true);
    expect(actualCompanies.map((company) => company.disabilitata)).toEqual([false, true, true]);
  });
});

describe('company lookups', () => {
  it('finds the company id by VAT number', async () => {
    const actualId = await getCompanyIdByVatNumber(
      buildApiWithAziende(inputAziende),
      ' 00240600395 ',
    );
    expect(actualId).toBe(453581);
  });

  it('finds the company id by exact name, then by partial match', async () => {
    const inputApi = buildApiWithAziende(inputAziende);
    expect(await getCompanyIdByName(inputApi, 'azienda prova')).toBe(453581);
    expect(await getCompanyIdByName(buildApiWithAziende(inputAziende), 'ancarani')).toBe(456205);
  });

  it('returns null when nothing matches', async () => {
    const actualId = await getCompanyIdByVatNumber(buildApiWithAziende(inputAziende), '99999');
    expect(actualId).toBeNull();
  });
});
