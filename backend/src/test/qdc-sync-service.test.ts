import type { PrismaClient } from '@prisma/client';
import { QdcSyncService } from '../infrastructure/services/integrations/qdc_imageline/sync/qdc-sync.service';
import { computeSyncWindow } from '../infrastructure/services/integrations/qdc_imageline/sync/qdc-sync-utils';
import { formatDateIT } from '../infrastructure/services/integrations/qdc_imageline/utils';
import type { QdcImageLineRestApi } from '../infrastructure/services/integrations/qdc_imageline';

jest.mock('../infrastructure/services/integrations/qdc_imageline/sync/qdc-sync-utils', () => ({
  ...jest.requireActual(
    '../infrastructure/services/integrations/qdc_imageline/sync/qdc-sync-utils',
  ),
  delay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../infrastructure/services/analytics/analytics-service.singleton', () => ({
  getAnalyticsService: () => ({ capture: jest.fn() }),
}));

function tableResponse(columns: string[], data: unknown[][]): unknown {
  return { message: 'ok', result: { COLUMNS: columns, DATA: data } };
}

function lowercaseResponse(columns: string[], data: unknown[][]): unknown {
  return { message: 'ok', result: { columns, data, rows: data.length } };
}

const EMPTY_OPS = lowercaseResponse(['ID', 'DATA'], []);

function buildFakeApi(): Record<string, Record<string, jest.Mock>> {
  return {
    licenza: {
      getLicenzaAziende: jest
        .fn()
        .mockResolvedValue(
          tableResponse(
            ['ID', 'AZIENDA', 'PIVA', 'CF', 'VALIDADA', 'VALIDAA'],
            [
              [
                456205,
                'ANCARANI ALIDE',
                'IT01065130393',
                'NCRLDA51D61D458H',
                '28/03/2024',
                '28/03/2027',
              ],
            ],
          ),
        ),
      getScadenze: jest.fn().mockResolvedValue({ patentini: [{ numero: 'P1' }], tarature: [] }),
    },
    colture: {
      getUnita: jest.fn().mockResolvedValue(
        lowercaseResponse(
          ['ID_UNITA', 'ANNOINIZIO', 'COLTURA', 'VARIETA', 'SUPERFICIE', 'LAT', 'LON'],
          [
            [1264740, 2025, 'VITE', 'TREBBIANO', 0.4271, null, null],
            [null, 2025, 'VITE', 'SENZA-ID', 1, null, null],
          ],
        ),
      ),
    },
    operazioniCampo: {
      getTrattamenti: jest
        .fn()
        .mockResolvedValue(lowercaseResponse(['ID', 'DATA'], [[101, '15/06/2026']])),
      getFertilizzazioni: jest.fn().mockResolvedValue(EMPTY_OPS),
      getIrrigazioni: jest.fn().mockResolvedValue(EMPTY_OPS),
      getRaccolte: jest.fn().mockResolvedValue(EMPTY_OPS),
      getSemine: jest.fn().mockResolvedValue(EMPTY_OPS),
      getTrapianti: jest.fn().mockResolvedValue(EMPTY_OPS),
      getSovesci: jest.fn().mockResolvedValue(EMPTY_OPS),
      getIspezioniCampo: jest.fn().mockResolvedValue(EMPTY_OPS),
      getLanciAusiliari: jest.fn().mockResolvedValue(EMPTY_OPS),
    },
    operazioniRegistro: {
      getAltreOperazioni: jest.fn().mockResolvedValue(EMPTY_OPS),
      getConceSementi: jest.fn().mockResolvedValue(EMPTY_OPS),
      getSmaltimentiRifiuti: jest.fn().mockResolvedValue(EMPTY_OPS),
      getOperazioniEliminate: jest.fn().mockResolvedValue(EMPTY_OPS),
    },
    magazzinoAgrofarmaci: {
      getGiacenzeAgrofarmaci: jest
        .fn()
        .mockResolvedValue(
          tableResponse(
            ['PRODOTTO', 'NUMREG', 'SETTORE', 'QTA', 'UDM'],
            [['Rame 20', 12345, 'A', 5, 'KG']],
          ),
        ),
    },
    magazzinoFertilizzanti: {
      getGiacenzeFertilizzanti: jest.fn().mockResolvedValue(tableResponse(['PRODOTTO'], [])),
    },
  };
}

interface PrismaMock {
  company: { findMany: jest.Mock };
  qdcAzienda: { upsert: jest.Mock; update: jest.Mock };
  qdcUnita: { upsert: jest.Mock };
  qdcOperazione: { upsert: jest.Mock; deleteMany: jest.Mock };
  qdcGiacenza: { deleteMany: jest.Mock; createMany: jest.Mock };
  qdcScadenza: { deleteMany: jest.Mock; createMany: jest.Mock };
  qdcSyncRun: { update: jest.Mock };
  $transaction: jest.Mock;
}

function buildPrismaMock(lastSyncedAt: Date | null = null): PrismaMock {
  return {
    company: { findMany: jest.fn().mockResolvedValue([]) },
    qdcAzienda: {
      upsert: jest.fn().mockImplementation(({ where, create }) =>
        Promise.resolve({
          id: `az-${where.qdcId}`,
          qdcId: where.qdcId,
          nome: create.nome,
          piva: create.piva,
          cf: create.cf,
          companyId: create.companyId,
          lastSyncedAt,
        }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    qdcUnita: { upsert: jest.fn().mockResolvedValue({}) },
    qdcOperazione: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    qdcGiacenza: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    qdcScadenza: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    qdcSyncRun: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function buildService(prismaMock: PrismaMock, api: unknown): QdcSyncService {
  return new QdcSyncService({
    prisma: prismaMock as unknown as PrismaClient,
    getApi: jest.fn().mockResolvedValue(api as QdcImageLineRestApi),
  });
}

const RUN_INPUT = { syncRunId: 'run-1', trigger: 'manual' as const, clientId: 'cid', userId: 'u1' };

describe('QdcSyncService.runSync', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('syncs aziende, unità, operazioni, giacenze and scadenze then finalizes with success', async () => {
    const inputPrisma = buildPrismaMock();
    const inputApi = buildFakeApi();
    const actualOutcome = await buildService(inputPrisma, inputApi).runSync(RUN_INPUT);
    expect(actualOutcome.status).toBe('success');
    expect(actualOutcome.counters.aziendeTotal).toBe(1);
    expect(actualOutcome.counters.unitaUpserted).toBe(1);
    expect(actualOutcome.counters.skippedNoId).toBe(1);
    expect(actualOutcome.counters.operazioniUpserted).toBe(1);
    expect(actualOutcome.counters.giacenzeRows).toBe(1);
    expect(actualOutcome.counters.scadenzeRows).toBe(1);
    expect(inputPrisma.qdcOperazione.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          qdcAziendaId_tipo_qdcId: { qdcAziendaId: 'az-456205', tipo: 'trattamenti', qdcId: 101 },
        },
      }),
    );
    expect(inputPrisma.qdcAzienda.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'az-456205' } }),
    );
    expect(inputPrisma.qdcSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'success', error: null }),
      }),
    );
  });

  it('links the azienda to the Seminai company via normalized VAT', async () => {
    const inputPrisma = buildPrismaMock();
    inputPrisma.company.findMany.mockResolvedValue([
      { id: 'company-1', vatNumber: '01065130393', fiscalCode: 'X' },
    ]);
    await buildService(inputPrisma, buildFakeApi()).runSync(RUN_INPUT);
    expect(inputPrisma.qdcAzienda.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ companyId: 'company-1', piva: '01065130393' }),
      }),
    );
  });

  it('marks the run partial and skips lastSyncedAt when a step fails', async () => {
    const inputPrisma = buildPrismaMock();
    const inputApi = buildFakeApi();
    inputApi.operazioniCampo.getIrrigazioni.mockRejectedValue(new Error('boom irrigazioni'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const actualOutcome = await buildService(inputPrisma, inputApi).runSync(RUN_INPUT);
    expect(actualOutcome.status).toBe('partial');
    expect(actualOutcome.counters.aziendeFailed).toBe(1);
    expect(inputPrisma.qdcAzienda.update).not.toHaveBeenCalled();
    expect(inputPrisma.qdcSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'partial',
          error: expect.stringContaining('operazioni'),
        }),
      }),
    );
  });

  it('finalizes with error when the anagrafica call fails', async () => {
    const inputPrisma = buildPrismaMock();
    const inputApi = buildFakeApi();
    inputApi.licenza.getLicenzaAziende.mockRejectedValue(new Error('licenza down'));
    const actualOutcome = await buildService(inputPrisma, inputApi).runSync(RUN_INPUT);
    expect(actualOutcome.status).toBe('error');
    expect(inputPrisma.qdcSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('licenza down'),
        }),
      }),
    );
  });

  it('limits the deep sync to maxAziende while anagrafica still syncs everything', async () => {
    const inputPrisma = buildPrismaMock();
    const inputApi = buildFakeApi();
    inputApi.licenza.getLicenzaAziende.mockResolvedValue(
      tableResponse(
        ['ID', 'AZIENDA', 'PIVA', 'CF', 'VALIDADA', 'VALIDAA'],
        [
          [1, 'A', '', '', '', ''],
          [2, 'B', '', '', '', ''],
          [3, 'C', '', '', '', ''],
        ],
      ),
    );
    const actualOutcome = await buildService(inputPrisma, inputApi).runSync({
      ...RUN_INPUT,
      options: { maxAziende: 1 },
    });
    expect(inputPrisma.qdcAzienda.upsert).toHaveBeenCalledTimes(3);
    expect(actualOutcome.counters.aziendeTotal).toBe(1);
    expect(inputApi.colture.getUnita).toHaveBeenCalledTimes(1);
  });

  it('passes the incremental window (lastSyncedAt − 7 days) to the operation fetchers', async () => {
    const lastSyncedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const inputPrisma = buildPrismaMock(lastSyncedAt);
    const inputApi = buildFakeApi();
    await buildService(inputPrisma, inputApi).runSync(RUN_INPUT);
    const expectedFrom = formatDateIT(new Date(lastSyncedAt.getTime() - 7 * 24 * 60 * 60 * 1000));
    expect(inputApi.operazioniCampo.getTrattamenti).toHaveBeenCalledWith(
      expect.objectContaining({ dataPeriodoDa: expectedFrom }),
    );
  });
});

describe('computeSyncWindow', () => {
  it('clamps the overlap start to the 365-day server maximum', () => {
    const inputLastSynced = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const expectedFrom = formatDateIT(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    expect(computeSyncWindow(inputLastSynced).dataDa).toBe(expectedFrom);
  });

  it('uses the full 365-day range on first run', () => {
    const actualWindow = computeSyncWindow(null);
    expect(actualWindow.dataDa).toBe(
      formatDateIT(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)),
    );
  });
});
