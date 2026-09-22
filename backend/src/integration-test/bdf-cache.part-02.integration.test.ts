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
  // Cache EXPIRED (7 days) → calls BDF API again
  // ============================================================

  describe('Cache EXPIRED (7-day TTL)', () => {
    it('should call BDF API again when cache entry is older than 7 days', async () => {
      const { mockClient, callCounts } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo);

      // First call → populate cache
      await cached.getColture();
      expect(callCounts.getColture).toBe(1);

      // Manually set updatedAt to 8 days ago to simulate expiration
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await prisma.bdfCache.updateMany({
        where: { endpoint: 'colture' },
        data: { updatedAt: eightDaysAgo },
      });

      // Second call → EXPIRED → should call API again
      const result = await cached.getColture();
      expect(callCounts.getColture).toBe(2);
      expect(result).toEqual(MOCK_COLTURE);

      // Verify updatedAt was refreshed (should be recent now)
      const entry = await prisma.bdfCache.findFirst({ where: { endpoint: 'colture' } });
      expect(entry).not.toBeNull();
      const ageMs = Date.now() - entry!.updatedAt.getTime();
      expect(ageMs).toBeLessThan(5000); // Updated within last 5 seconds
    });

    it('should NOT call BDF API when cache is 6 days old (still fresh)', async () => {
      const { mockClient, callCounts } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo);

      // Populate cache
      await cached.getColture();
      expect(callCounts.getColture).toBe(1);

      // Set updatedAt to 6 days ago (still within 7-day window)
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      await prisma.bdfCache.updateMany({
        where: { endpoint: 'colture' },
        data: { updatedAt: sixDaysAgo },
      });

      // Should still be a HIT
      await cached.getColture();
      expect(callCounts.getColture).toBe(1); // No additional call
    });

    it('should handle boundary: cache exactly 7 days old triggers refresh', async () => {
      const { mockClient, callCounts } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo);

      // Populate cache
      await cached.getColture();
      expect(callCounts.getColture).toBe(1);

      // Set updatedAt to exactly 7 days + 1 second ago
      const sevenDaysAndOneSecond = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000 + 1000));
      await prisma.bdfCache.updateMany({
        where: { endpoint: 'colture' },
        data: { updatedAt: sevenDaysAndOneSecond },
      });

      // Should be EXPIRED → call API
      await cached.getColture();
      expect(callCounts.getColture).toBe(2);
    });

    it('should expire and refresh parameterized entries independently', async () => {
      const { mockClient, callCounts } = createMockBdfClient();
      const cached = new CachedBdfClient(mockClient, cacheRepo);

      // Populate cache for two different colture
      await cached.getAvversita(74);
      await cached.getAvversita(75);
      expect(callCounts.getAvversita).toBe(2);

      // Expire only coltura=74
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const entry74 = await prisma.bdfCache.findFirst({
        where: { endpoint: 'avversita', params: { equals: { coltura: '74' } } },
      });
      if (entry74) {
        await prisma.bdfCache.update({
          where: { id: entry74.id },
          data: { updatedAt: eightDaysAgo },
        });
      }

      // Call coltura=74 → EXPIRED → should call API
      await cached.getAvversita(74);
      expect(callCounts.getAvversita).toBe(3);

      // Call coltura=75 → still fresh → should NOT call API
      await cached.getAvversita(75);
      expect(callCounts.getAvversita).toBe(3); // No additional call
    });
  });});
