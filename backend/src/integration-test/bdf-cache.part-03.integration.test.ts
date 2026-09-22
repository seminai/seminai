import dotenv from 'dotenv';
import { createPrismaClient } from '../infrastructure/repositories/Prisma';
import { PrismaBdfCacheRepository } from '../infrastructure/repositories/PrismaBdfCacheRepository';
import { CachedBdfClient } from '../infrastructure/services/integrations/bdf/cachedClient';
import { BdfClient } from '../infrastructure/services/integrations/bdf/client';
import type { BdfColtura, BdfAvversita, BdfProdotto, BdfDose } from '../infrastructure/services/integrations/bdf/types';

dotenv.config();

const prisma = createPrismaClient();

// ============================================================
// Mock BDF Data
// ============================================================

const MOCK_COLTURE: BdfColtura[] = [
  { ID_PV: 74, NOME_COLTURA: 'Actinidia' },
  { ID_PV: 75, NOME_COLTURA: 'Vite da uva da vino' },
];

const MOCK_AVVERSITA: BdfAvversita[] = [
  { COD_AVVERSITA: '00266', NOME_ITA: 'Peronospora della vite' },
  { COD_AVVERSITA: '00300', NOME_ITA: 'Oidio della vite' },
];

const MOCK_PRODOTTI: BdfProdotto[] = [
  {
    COD_PRODOTTO: '3872',
    NOME_COMMERCIALE: 'EPIK SL',
    IN_VENDITA: true,
    BIO: false,
    NUM_REG: '12345',
    SA1: 'Acetamiprid',
    SA2: null,
    SA3: null,
    REVOCATO: false,
    SCORTE: null,
    ConCatalogo: true,
  },
];

const MOCK_DOSI: BdfDose[] = [
  {
    ID_DOSE: 1,
    COD_PRODOTTO: '3872',
    CODICE_PV: '74',
    COD_AVVERSITA: '00266',
    COD_GR_AVV: null,
    DOSE_MIN: 100,
    DOSE_MAX: 200,
    COD_UM_DOSE: 'g/hl',
    NUM_MAX_INT: 3,
    INTERV_TRATT: 10,
    COD_SITO: null,
    COD_METODO_DIST: null,
    COD_STADIO_COLT: null,
    COD_STADIO_AVV: null,
    NOTE: null,
    ID_PV: 74,
    DOSE_MIN_2: null,
    DOSE_MAX_2: null,
    COD_UM_DOSE_2: null,
    ACQUA_HA_MIN: null,
    ACQUA_HA_MAX: null,
    INTERV_TRATT_MAX: null,
    RIF_MAX_TRATT: null,
    EPOCA_INTERVENTO: null,
    NUM_MAX_INT_AVV: null,
    MS: null,
    QTA_MAX: null,
    COD_UM_QTA_MAX: null,
    SCADENZA_DOSI: null,
    EX_IS: null,
    EX_NOME: null,
    TIPO_IMP: null,
    DOSE_LIMITE: null,
    DOSE_LIMITE_2: null,
    DATA_INS: null,
    DATA_UPD: null,
    ID_DETTAGLIO_IMP: null,
    RIF_MAX_TRATT2: null,
    NUM_MAX_INT2: null,
    DECORRENZA: null,
    AUT_EMERGENZA: null,
    JOLLY: null,
    NOME_COMMERCIALE: 'EPIK SL',
    BIO: false,
    NOME_SCI: null,
    NOME_ITA: null,
    DECO_SITO: null,
    DECO_METODO_DIST: null,
    DECO_STADIO_AVV: null,
    DECO_STADIO_COLT: null,
    DECO_UM_DOSE: 'g/hl',
    DECO_UM_DOSE_2: null,
    DECO_UM_QTA_MAX: null,
    SA1: 'Acetamiprid',
    SA2: null,
    SA3: null,
    PA1: null,
    PA2: null,
    PA3: null,
    P_SA1: null,
    P_SA2: null,
    P_SA3: null,
    NUM_REG: '12345',
    DISTRIBUTORI: 'Test Dist',
    Formulaz: null,
    DECO_DETTAGLIO_IMP: null,
    CARENZA: 14,
    CARENZA_P: null,
  },
];

// ============================================================
// Helper: create a mock BdfClient
// ============================================================

function createMockBdfClient() {
  const callCounts = {
    getColture: 0,
    getAvversita: 0,
    getProdotti: 0,
    getDosi: 0,
  };

  const mockClient = {
    getColture: jest.fn(async () => {
      callCounts.getColture++;
      return MOCK_COLTURE;
    }),
    getAvversita: jest.fn(async () => {
      callCounts.getAvversita++;
      return MOCK_AVVERSITA;
    }),
    getProdotti: jest.fn(async () => {
      callCounts.getProdotti++;
      return MOCK_PRODOTTI;
    }),
    getDosi: jest.fn(async () => {
      callCounts.getDosi++;
      return MOCK_DOSI;
    }),
    getTipologie: jest.fn(async () => []),
    getProdottoDati: jest.fn(async () => []),
    getComposizione: jest.fn(async () => []),
    getImpieghi: jest.fn(async () => []),
    getDistributori: jest.fn(async () => []),
    getSostanzeAttive: jest.fn(async () => []),
    getSostanzaAttivaDati: jest.fn(async () => []),
    getPittogrammi: jest.fn(async () => '<html></html>'),
    authenticate: jest.fn(async () => 'mock-token'),
  } as unknown as BdfClient;

  return { mockClient, callCounts };
}
// ============================================================
// Tests
// ============================================================

describe('BDF Cache Integration Tests', () => {
  let cacheRepo: PrismaBdfCacheRepository;

  beforeAll(async () => {
    await prisma.$connect();
    cacheRepo = new PrismaBdfCacheRepository(prisma);
  });

  afterAll(async () => {
    // Cleanup all BDF cache entries created during tests
    await prisma.bdfCache.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean cache before each test
    await prisma.bdfCache.deleteMany({});
  });

  // ============================================================
  // Custom maxAgeDays
  // ============================================================

  describe('Custom TTL', () => {
    it('should respect custom maxAgeDays (e.g., 1 day)', async () => {
      const { mockClient, callCounts } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo, 1); // 1 day TTL

      // Populate
      await cached.getColture();
      expect(callCounts.getColture).toBe(1);

      // Set to 2 days ago → expired with 1-day TTL
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await prisma.bdfCache.updateMany({
        where: { endpoint: 'colture' },
        data: { updatedAt: twoDaysAgo },
      });

      await cached.getColture();
      expect(callCounts.getColture).toBe(2);
    });
  });

  // ============================================================
  // Cache upsert (update existing entry on re-fetch)
  // ============================================================

  describe('Cache upsert on refresh', () => {
    it('should update existing cache entry (not create duplicate) on expiration', async () => {
      const { mockClient } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo);

      // Populate
      await cached.getColture();

      // Expire
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await prisma.bdfCache.updateMany({
        where: { endpoint: 'colture' },
        data: { updatedAt: eightDaysAgo },
      });

      // Re-fetch → should upsert, not create duplicate
      await cached.getColture();

      const entries = await prisma.bdfCache.findMany({ where: { endpoint: 'colture' } });
      expect(entries.length).toBe(1); // Only 1 entry, not 2
    });
  });

  // ============================================================
  // Repository methods: invalidate
  // ============================================================

  describe('Cache invalidation', () => {
    it('invalidateByEndpoint should remove all entries for an endpoint', async () => {
      const { mockClient } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo);

      // Populate multiple endpoints
      await cached.getColture();
      await cached.getAvversita(74);
      await cached.getAvversita(75);

      // Invalidate only avversita
      await cacheRepo.invalidateByEndpoint('avversita');

      const coltureEntries = await prisma.bdfCache.findMany({ where: { endpoint: 'colture' } });
      const avversitaEntries = await prisma.bdfCache.findMany({ where: { endpoint: 'avversita' } });

      expect(coltureEntries.length).toBe(1); // Untouched
      expect(avversitaEntries.length).toBe(0); // Removed
    });

    it('invalidateExpired should remove only entries older than maxAgeDays', async () => {
      const { mockClient } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo);

      // Populate
      await cached.getColture();
      await cached.getAvversita(74);

      // Expire colture only
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await prisma.bdfCache.updateMany({
        where: { endpoint: 'colture' },
        data: { updatedAt: tenDaysAgo },
      });

      // Invalidate entries older than 7 days
      const removed = await cacheRepo.invalidateExpired(7);
      expect(removed).toBe(1);

      const remaining = await prisma.bdfCache.findMany({});
      expect(remaining.length).toBe(1);
      expect(remaining[0].endpoint).toBe('avversita');
    });
  });});
