jest.mock('../../../llm-model-factory', () => ({ createChatModel: jest.fn() }));

jest.mock('../../../integrations/bdf', () => ({
  createCachedBdfClient: jest.fn(() => ({})),
  searchBdfProductsByAdversity: jest.fn(),
}));

jest.mock('../../shared/resolveProductData', () => ({
  resolveProductData: jest.fn(),
}));

jest.mock('../tools/stock/verified-stock.helper', () => ({
  loadVerifiedStockByRegistration: jest.fn(),
  normalizeRegistrationNumber: (r: string) => r.replace(/^0+/, ''),
}));

jest.mock('../tools/recommend-ranking', () => {
  const actual = jest.requireActual('../tools/recommend-ranking');
  return { ...actual, estimateEfficacy: jest.fn().mockResolvedValue(new Map()) };
});

jest.mock('../../dosage_agent/revokedProductChecker', () => ({
  checkProductRevoked: jest.fn(() => ({ isRevoked: false, info: null })),
  buildRevokedExclusionMessage: jest.fn(() => 'Prodotto revocato'),
}));

import { createRecommendBestProductsTool } from '../tools/recommend-best-products.tool';
import { searchBdfProductsByAdversity } from '../../../integrations/bdf';
import { resolveProductData } from '../../shared/resolveProductData';
import { checkProductRevoked } from '../../dosage_agent/revokedProductChecker';
import { clearWorkingMemory, getWorkingMemory } from '../working-memory';

const searchMock = searchBdfProductsByAdversity as jest.Mock;
const resolveMock = resolveProductData as jest.Mock;
const revokedMock = checkProductRevoked as jest.Mock;

function resolution(name: string, reg: string) {
  return {
    productName: name,
    registrationNumber: reg,
    activeIngredients: [{ name: 'rame', fracMoa: 'M01' }],
    category: 'Fungicida',
    bio: false,
    revoked: false,
    doses: [
      {
        coltura: 'Vite',
        malattia: 'Peronospora',
        dose_minima: 1,
        dose_massima: 2,
        dose_um: 'kg/ha',
        intervallo_sicurezza_giorni: 10,
      },
    ],
    meccanismo_azione_frac: 'M01',
    fasce_rispetto_acqua: '10 m',
    source: 'bdf',
  };
}

describe('recommend_best_products tool', () => {
  const threadId = 'thread-rec';
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    revokedMock.mockReturnValue({ isRevoked: false, info: null });
    clearWorkingMemory(threadId);
    Object.assign(process.env, {
      URL_SERVER_BDF: 'http://bdf',
      USERNAME_BDF: 'u',
      PASSWORD_BDF: 'p',
    });
  });

  afterEach(() => clearWorkingMemory(threadId));
  afterAll(() => {
    process.env = originalEnv;
  });

  it('errors when BDF is not configured', async () => {
    delete process.env.URL_SERVER_BDF;
    const tool = createRecommendBestProductsTool(threadId);
    const result = JSON.parse(await tool.func({ cropName: 'Vite', adversityName: 'Peronospora' }));
    expect(result.error).toContain('BDF non configurato');
  });

  it('ranks candidates, seeds working memory and flags missing data dimensions', async () => {
    searchMock.mockResolvedValue({
      crop: { id: 74, nome: 'Vite' },
      adversity: { codice: '266', nome: 'Peronospora' },
      products: [
        {
          codice: 'P1',
          nome: 'Alpha',
          numRegistrazione: 'A1',
          bio: false,
          inVendita: true,
          revocato: false,
          sostanzeAttive: ['rame'],
          scorte: null,
        },
        {
          codice: 'P2',
          nome: 'Beta',
          numRegistrazione: 'B2',
          bio: false,
          inVendita: true,
          revocato: false,
          sostanzeAttive: ['zolfo'],
          scorte: null,
        },
      ],
    });
    resolveMock.mockImplementation((p: { productName: string; registrationNumber: string }) =>
      Promise.resolve(resolution(p.productName, p.registrationNumber)),
    );

    const tool = createRecommendBestProductsTool(threadId); // no userId → stock not evaluated
    const result = JSON.parse(await tool.func({ cropName: 'Vite', adversityName: 'Peronospora' }));

    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].rank).toBe(1);
    expect(result.recommendations[0].source).toBe('bdf');
    expect(result.recommendations[0].doseRange).toBe('1-2 kg/ha');
    expect(result.nextRequiredTool).toBe('search_products');
    expect(result.dimensionsMissingData).toEqual(
      expect.arrayContaining([
        expect.stringContaining('efficacia'),
        expect.stringContaining('magazzino'),
      ]),
    );

    const wm = getWorkingMemory(threadId);
    expect(wm.recommendedProducts).toHaveLength(2);
    expect(wm.inputProducts).toHaveLength(2);
    expect((wm.inputProducts as Array<{ productName: string }>)[0].productName).toBeDefined();
  });

  it('excludes revoked products from recommendations', async () => {
    searchMock.mockResolvedValue({
      crop: { id: 74, nome: 'Vite' },
      adversity: { codice: '266', nome: 'Peronospora' },
      products: [
        {
          codice: 'P1',
          nome: 'Alpha',
          numRegistrazione: 'A1',
          bio: false,
          inVendita: true,
          revocato: false,
          sostanzeAttive: ['rame'],
          scorte: null,
        },
        {
          codice: 'P2',
          nome: 'Beta',
          numRegistrazione: 'B2',
          bio: false,
          inVendita: true,
          revocato: false,
          sostanzeAttive: ['zolfo'],
          scorte: null,
        },
      ],
    });
    resolveMock.mockImplementation((p: { productName: string; registrationNumber: string }) =>
      Promise.resolve(resolution(p.productName, p.registrationNumber)),
    );
    revokedMock.mockImplementation((reg?: string) =>
      reg === 'A1'
        ? {
            isRevoked: true,
            info: {
              regNumber: 'A1',
              productName: 'Alpha',
              revokeDate: '2025-01-01',
              revokeReason: 'test',
            },
          }
        : { isRevoked: false, info: null },
    );

    const tool = createRecommendBestProductsTool(threadId);
    const result = JSON.parse(await tool.func({ cropName: 'Vite', adversityName: 'Peronospora' }));

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].registrationNumber).toBe('B2');
    expect(result.excludedRevoked).toHaveLength(1);
    expect(result.excludedRevoked[0].numRegistrazione).toBe('A1');
  });

  it('passes through a structured error when no products are authorized', async () => {
    searchMock.mockResolvedValue({ error: 'Coltura non trovata', products: [] });
    const tool = createRecommendBestProductsTool(threadId);
    const result = JSON.parse(await tool.func({ cropName: 'Xyz', adversityName: 'Peronospora' }));
    expect(result.error).toBe('Coltura non trovata');
    expect(result.hint).toContain('etichette');
  });
});
