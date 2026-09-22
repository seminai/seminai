jest.mock('@prisma/client', () => ({
  Prisma: { QueryMode: { insensitive: 'insensitive' } },
}));

const mockClient = {
  getProdotti: jest.fn(),
  getProdottoDati: jest.fn(),
  getColture: jest.fn(),
  getAvversita: jest.fn(),
  getDosi: jest.fn(),
};
const mockEnsureExecute = jest.fn();
const mockListPairs = jest.fn();

jest.mock('../../../integrations/bdf', () => ({
  createCachedBdfClient: jest.fn(() => mockClient),
  findBestDirectMatch: <T>(query: string, entries: T[], getName: (e: T) => string): T | undefined =>
    entries.find((e) => getName(e).toLowerCase() === query.toLowerCase()) ??
    entries.find((e) => getName(e).toLowerCase().includes(query.toLowerCase())),
  resolveNameWithLlm: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: { labelExtraction: { findFirst: jest.fn() } },
}));

jest.mock('../../../../../application/use-cases/label/EnsureLabelExistsUseCase', () => ({
  createEnsureLabelExistsUseCase: jest.fn(() => ({ execute: mockEnsureExecute })),
}));

jest.mock('../../../../repositories/CsvBdfLabelDatasetRepository', () => ({
  CsvBdfLabelDatasetRepository: jest.fn().mockImplementation(() => ({
    listAvailablePairs: mockListPairs,
    findDetailByProductAndRegistration: jest.fn(),
  })),
}));

import { resolveProductData } from '../../shared/resolveProductData';
import { createEnsureLabelExistsUseCase } from '../../../../../application/use-cases/label/EnsureLabelExistsUseCase';
import { prisma } from '../../../../repositories/Prisma';

const findFirstMock = prisma.labelExtraction.findFirst as unknown as jest.Mock;

function makeLabel(overrides: Record<string, unknown> = {}) {
  return {
    prodotto: 'Test Prod',
    categoria: 'Fungicida',
    principio_attivo: 'rame + zolfo',
    meccanismo_azione_frac: 'M01',
    colture_target: ['Vite'],
    dosaggi_dettagliati: [
      {
        coltura: 'Vite',
        malattia: 'Peronospora',
        dose_minima: 1,
        dose_massima: 2,
        dose_um: 'kg/ha',
        n_max_applicazioni: 3,
        intervallo_sicurezza_giorni: 10,
      },
    ],
    fasce_rispetto_acqua: '10 m',
    numero_registrazione: '12345',
    malattie: [],
    specie: [],
    fasce_di_rispetto_e_deriva: [],
    avvertenze: [],
    frasi_pericolo: [],
    frasi_prudenza: [],
    composizione: null,
    compatibilita: null,
    fitotossicita: null,
    note_tecniche: null,
    extraction_confidence: 90,
    extracted_fields: [],
    errors: [],
    ...overrides,
  };
}

const BDF_ENV = { URL_SERVER_BDF: 'http://bdf', USERNAME_BDF: 'u', PASSWORD_BDF: 'p' };

describe('resolveProductData waterfall', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    findFirstMock.mockResolvedValue(null);
    mockListPairs.mockResolvedValue([]);
    delete process.env.URL_SERVER_BDF;
    delete process.env.USERNAME_BDF;
    delete process.env.PASSWORD_BDF;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses BDF FIRST when configured (short-circuits label DB)', async () => {
    Object.assign(process.env, BDF_ENV);
    mockClient.getProdotti.mockResolvedValue([
      {
        COD_PRODOTTO: 'P1',
        NOME_COMMERCIALE: 'Test Prod',
        NUM_REG: '12345',
        SA1: 'rame',
        SA2: 'zolfo',
        SA3: null,
        BIO: false,
        REVOCATO: false,
        IN_VENDITA: true,
        SCORTE: null,
      },
    ]);
    mockClient.getProdottoDati.mockResolvedValue([{ TIPOLOGIA: 'Fungicida', FORMULAZIONE: 'WG' }]);
    mockClient.getColture.mockResolvedValue([{ ID_PV: 74, NOME_COLTURA: 'Vite' }]);
    mockClient.getAvversita.mockResolvedValue([{ COD_AVVERSITA: '266', NOME_ITA: 'Peronospora' }]);
    mockClient.getDosi.mockResolvedValue([
      {
        ID_DOSE: 1,
        NOME_ITA: 'Peronospora',
        DOSE_MIN: 1,
        DOSE_MAX: 2,
        DECO_UM_DOSE: 'kg/ha',
        NUM_MAX_INT: 3,
        CARENZA: 10,
      },
    ]);

    const r = await resolveProductData({
      productName: 'Test Prod',
      registrationNumber: '12345',
      cropName: 'Vite',
      adversityName: 'Peronospora',
    });

    expect(r.source).toBe('bdf');
    expect(r.activeIngredients.map((a) => a.name)).toEqual(['rame', 'zolfo']);
    expect(r.bio).toBe(false);
    expect(r.doses).toHaveLength(1);
    expect(r.doses[0].malattia).toBe('Peronospora');
  });

  it('falls back to label DB when BDF returns no product', async () => {
    Object.assign(process.env, BDF_ENV);
    mockClient.getProdotti.mockResolvedValue([]);
    findFirstMock.mockResolvedValue({ label: makeLabel() });

    const r = await resolveProductData({ productName: 'Test Prod', cropName: 'Vite' });

    expect(r.source).toBe('label_db');
    expect(r.activeIngredients.map((a) => a.name)).toEqual(['rame', 'zolfo']);
    expect(r.meccanismo_azione_frac).toBe('M01');
    expect(r.doses).toHaveLength(1);
  });

  it('skips the SIAN scraping tier when allowScraping is false', async () => {
    const r = await resolveProductData({ productName: 'Unknown', allowScraping: false });

    expect(mockEnsureExecute).not.toHaveBeenCalled();
    expect(createEnsureLabelExistsUseCase).not.toHaveBeenCalled();
    expect(r.source).toBe('none');
  });

  it('reaches the SIAN scraping tier when DB misses and scraping is allowed', async () => {
    mockEnsureExecute.mockResolvedValue({
      source: 'fito_extracted',
      record: { label: makeLabel() },
    });

    const r = await resolveProductData({ productName: 'Unknown', cropName: 'Vite' });

    expect(mockEnsureExecute).toHaveBeenCalled();
    expect(r.source).toBe('fito_extracted');
    expect(r.activeIngredients.map((a) => a.name)).toEqual(['rame', 'zolfo']);
  });
});
