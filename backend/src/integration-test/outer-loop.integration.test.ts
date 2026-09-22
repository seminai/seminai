/**
 * Integration tests for OuterLoopService and schedule_alert tool.
 *
 * npm run test:integration -- --testPathPattern outer-loop
 */
import { createTestUser, deleteAllOuterLoopTriggers, prisma, type ITestUser } from './helpers';
import { TEST_INVITE_CODE } from './constants';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { OuterLoopService } from '../infrastructure/services/agents/dosage_agent_react/outer-loop/outer-loop.service';
import { createScheduleAlertTool } from '../infrastructure/services/agents/dosage_agent_react/tools/schedule-alert.tool';

let testUser: ITestUser;
let otherUser: ITestUser;
const service = new OuterLoopService();

beforeAll(async () => {
  testUser = await createTestUser();
  const register = new RegisterUseCase(new PrismaUserRepository(prisma));
  const created = await register.execute({
    email: `outer-loop-${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Outer Loop Second User',
    inviteCode: TEST_INVITE_CODE,
  });
  otherUser = {
    id: created.id,
    email: created.email,
    password: 'Password123!',
    name: created.name,
    emailVerified: created.emailVerified,
  };
});
afterEach(async () => {
  await deleteAllOuterLoopTriggers(testUser.id);
  await deleteAllOuterLoopTriggers(otherUser.id);
});
afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [otherUser.id] } },
  });
});

describe('OuterLoopService integration', () => {
  it('CRUD OuterLoopTrigger: create via scheduleAlert, verify DB record with status pending', async () => {
    const scheduledAt = new Date('2026-04-15T00:00:00Z');
    const entry = await service.scheduleAlert({
      userId: testUser.id,
      type: 'phenological',
      title: 'Fioritura vite',
      payload: { crop: 'vite' },
      scheduledAt,
    });
    const row = await prisma.outerLoopTrigger.findUnique({ where: { id: entry.id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('pending');
    expect(row?.type).toBe('phenological');
    expect(row?.title).toBe('Fioritura vite');
  });

  it('cancelAlert: create trigger, cancel it, verify status is dismissed', async () => {
    const entry = await service.scheduleAlert({
      userId: testUser.id,
      type: 'stock_alert',
      title: 'Scorte basse',
      payload: {},
      scheduledAt: new Date('2026-05-01T00:00:00Z'),
    });
    await service.cancelAlert(entry.id, testUser.id);
    const row = await prisma.outerLoopTrigger.findUnique({ where: { id: entry.id } });
    expect(row?.status).toBe('dismissed');
  });

  it('cancelAlert rejects cancellation from another user', async () => {
    const entry = await service.scheduleAlert({
      userId: testUser.id,
      type: 'stock_alert',
      title: 'Scorte basse',
      payload: {},
      scheduledAt: new Date('2026-05-01T00:00:00Z'),
    });

    await expect(service.cancelAlert(entry.id, otherUser.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'OUTER_LOOP_TRIGGER_FORBIDDEN',
    });
  });

  it('executeAlert: create trigger, execute it, verify status is sent and executedAt is set', async () => {
    const entry = await service.scheduleAlert({
      userId: testUser.id,
      type: 'treatment_window',
      title: 'Finestra trattamento',
      payload: {},
      scheduledAt: new Date('2026-04-20T00:00:00Z'),
    });
    await service.executeAlert(entry.id);
    const row = await prisma.outerLoopTrigger.findUnique({ where: { id: entry.id } });
    expect(row?.status).toBe('sent');
    expect(row?.executedAt).not.toBeNull();
  });

  it('listPendingTriggers: returns only triggers with scheduledAt <= now', async () => {
    const past = new Date('2020-01-01T00:00:00Z');
    const future = new Date('2030-01-01T00:00:00Z');
    await service.scheduleAlert({
      userId: testUser.id,
      type: 'phenological',
      title: 'A',
      payload: {},
      scheduledAt: past,
    });
    await service.scheduleAlert({
      userId: testUser.id,
      type: 'phenological',
      title: 'B',
      payload: {},
      scheduledAt: past,
    });
    await service.scheduleAlert({
      userId: testUser.id,
      type: 'phenological',
      title: 'C',
      payload: {},
      scheduledAt: future,
    });
    const pending = await service.listPendingTriggers(testUser.id);
    expect(pending).toHaveLength(2);
    expect(pending.map((p) => p.title).sort()).toEqual(['A', 'B']);
  });

  it('listAllTriggers with status filter: filtering works correctly', async () => {
    const base = new Date('2026-04-15T00:00:00Z');
    await service.scheduleAlert({
      userId: testUser.id,
      type: 'a',
      title: 'P1',
      payload: {},
      scheduledAt: base,
    });
    const e2 = await service.scheduleAlert({
      userId: testUser.id,
      type: 'a',
      title: 'P2',
      payload: {},
      scheduledAt: base,
    });
    const e3 = await service.scheduleAlert({
      userId: testUser.id,
      type: 'a',
      title: 'P3',
      payload: {},
      scheduledAt: base,
    });
    await service.cancelAlert(e2.id, testUser.id);
    await service.executeAlert(e3.id);
    const pending = await service.listAllTriggers(testUser.id, { status: 'pending' });
    const dismissed = await service.listAllTriggers(testUser.id, { status: 'dismissed' });
    const sent = await service.listAllTriggers(testUser.id, { status: 'sent' });
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('P1');
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0].title).toBe('P2');
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('P3');
  });

  it('deleteTriggersForUser: deletes all triggers and returns count', async () => {
    await service.scheduleAlert({
      userId: testUser.id,
      type: 'a',
      title: 'T1',
      payload: {},
      scheduledAt: new Date(),
    });
    await service.scheduleAlert({
      userId: testUser.id,
      type: 'a',
      title: 'T2',
      payload: {},
      scheduledAt: new Date(),
    });
    await service.scheduleAlert({
      userId: testUser.id,
      type: 'a',
      title: 'T3',
      payload: {},
      scheduledAt: new Date(),
    });
    const count = await service.deleteTriggersForUser(testUser.id);
    expect(count).toBe(3);
    const remaining = await prisma.outerLoopTrigger.count({ where: { userId: testUser.id } });
    expect(remaining).toBe(0);
  });
});

describe('schedule_alert tool', () => {
  it('creates DB record via tool invocation', async () => {
    const tool = createScheduleAlertTool(testUser.id);
    const result = await tool.invoke({
      type: 'phenological',
      title: 'Fioritura vite',
      payload: { crop: 'vite' },
      scheduledAt: '2026-04-15T00:00:00Z',
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.triggerId).toBeDefined();
    const row = await prisma.outerLoopTrigger.findUnique({ where: { id: parsed.triggerId } });
    expect(row).not.toBeNull();
    expect(row?.type).toBe('phenological');
    expect(row?.title).toBe('Fioritura vite');
    expect(row?.status).toBe('pending');
  });
});
