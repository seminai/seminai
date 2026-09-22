import { prisma } from './setup';
import { createTestUser, deleteTestUser } from './helpers';
import { PrismaSettingsRepository } from '../infrastructure/repositories/PrismaSettingsRepository';
import { Settings } from '../domain/entities/Settings';
import { QdcSyncService } from '../infrastructure/services/integrations/qdc_imageline/sync/qdc-sync.service';

// SAFETY: this suite is strictly READ-ONLY toward QDC (get* endpoints only)
// and writes exclusively into the LOCAL Seminai mirror tables. Never exercise
// QDC set*/del* endpoints in tests except against the dedicated test company
// ("AZIENDA PROVA").
const clientId = process.env.QDC_TEST_CLIENT_ID || process.env.IMAGE_LINE_CLIENT_ID;
const describeOrSkip = clientId ? describe : describe.skip;

const DEEP_SYNC_LIMIT = 3;

async function runManualSync(): Promise<{ status: string; syncRunId: string }> {
  const syncRun = await prisma.qdcSyncRun.create({
    data: { trigger: 'manual', status: 'running' },
  });
  const service = new QdcSyncService({ prisma });
  const outcome = await service.runSync({
    syncRunId: syncRun.id,
    trigger: 'manual',
    clientId: clientId!,
    options: { maxAziende: DEEP_SYNC_LIMIT },
  });
  return { status: outcome.status, syncRunId: syncRun.id };
}

describeOrSkip('QDC sync — real API into local mirror tables', () => {
  jest.setTimeout(600_000);

  beforeAll(async () => {
    await prisma.qdcSyncRun.deleteMany({});
    await prisma.qdcAzienda.deleteMany({});
  });

  afterAll(async () => {
    await prisma.qdcSyncRun.deleteMany({});
    await prisma.qdcAzienda.deleteMany({});
    await deleteTestUser();
  });

  it('mirrors anagrafica, unità, operazioni, giacenze and scadenze — idempotently', async () => {
    const firstRun = await runManualSync();
    expect(['success', 'partial']).toContain(firstRun.status);
    const aziendaCount = await prisma.qdcAzienda.count();
    expect(aziendaCount).toBeGreaterThanOrEqual(10);
    const operazioniCount = await prisma.qdcOperazione.count();
    const unitaCount = await prisma.qdcUnita.count();
    const giacenzeCount = await prisma.qdcGiacenza.count();
    const scadenzeCount = await prisma.qdcScadenza.count();
    console.log(
      `[qdc-sync-test] aziende=${aziendaCount} unita=${unitaCount} operazioni=${operazioniCount} giacenze=${giacenzeCount} scadenze=${scadenzeCount}`,
    );
    expect(operazioniCount).toBeGreaterThan(0);
    const finalizedRun = await prisma.qdcSyncRun.findUnique({ where: { id: firstRun.syncRunId } });
    expect(finalizedRun?.finishedAt).not.toBeNull();
    expect(finalizedRun?.counters).toBeTruthy();
    const secondRun = await runManualSync();
    expect(['success', 'partial']).toContain(secondRun.status);
    expect(await prisma.qdcAzienda.count()).toBe(aziendaCount);
    expect(await prisma.qdcOperazione.count()).toBe(operazioniCount);
    expect(await prisma.qdcUnita.count()).toBe(unitaCount);
  });

  it('round-trips the qdcSyncEnabled toggle through the settings repository', async () => {
    const user = await createTestUser();
    const repo = new PrismaSettingsRepository(prisma);
    let settings = await repo.findByUserId(user.id);
    if (!settings) {
      settings = await repo.create(
        Settings.create({
          userId: user.id,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
          whatsappInstanceName: null,
          whatsappApiKey: null,
          whatsappInstanceId: null,
          whatsappConnected: false,
          whatsappPhoneNumber: null,
          whatsappQrCode: null,
          whatsappLastSync: null,
          whatsappAllowedNumbers: [],
        }),
      );
    }
    expect(settings.isQdcSyncEnabled()).toBe(false);
    const enabled = await repo.updateQdcSyncEnabled(settings.id, true);
    expect(enabled.isQdcSyncEnabled()).toBe(true);
    const reloaded = await repo.findByUserId(user.id);
    expect(reloaded?.isQdcSyncEnabled()).toBe(true);
    await repo.updateQdcSyncEnabled(settings.id, false);
  });
});
