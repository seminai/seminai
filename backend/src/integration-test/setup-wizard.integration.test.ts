import { randomUUID } from 'node:crypto';
import { prisma } from './setup';
import { CompleteSetupUseCase } from '../application/use-cases/setup/CompleteSetupUseCase';
import { GetSetupStatusUseCase } from '../application/use-cases/setup/GetSetupStatusUseCase';
import { InstanceSettingStore } from '../infrastructure/settings/InstanceSettingStore';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { buildPublicRuntimeConfig } from '../infrastructure/runtime/publicRuntimeConfig';
import { AppError } from '../domain/errors/AppError';

describe('setup wizard persistence', () => {
  const previousSettings: Array<{ id: string; key: string; valueEnc: string; createdAt: Date; updatedAt: Date }> =
    [];
  const createdEmails: string[] = [];
  const previousEnv: Record<string, string | undefined> = {};
  const envKeys = ['ENCRYPTION_SECRET', 'JWT_SECRET', 'SETUP_COMPLETED', 'LLM_GATEWAY'] as const;

  beforeAll(async () => {
    for (const key of envKeys) previousEnv[key] = process.env[key];
    if (!process.env.ENCRYPTION_SECRET || process.env.ENCRYPTION_SECRET.includes('<')) {
      process.env.ENCRYPTION_SECRET = 'e'.repeat(64);
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('<')) {
      process.env.JWT_SECRET = 'j'.repeat(40);
    }
    previousSettings.push(...(await prisma.instanceSetting.findMany()));
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await prisma.instanceSetting.deleteMany();
    if (previousSettings.length > 0) {
      await prisma.instanceSetting.createMany({ data: previousSettings });
    }
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  it('completes setup once, persists settings across apply, then locks mutations', async () => {
    const store = new InstanceSettingStore(prisma.instanceSetting);
    const email = `setup-admin-${randomUUID()}@example.com`;
    createdEmails.push(email);
    const complete = new CompleteSetupUseCase(new PrismaUserRepository(prisma), store);
    const status = new GetSetupStatusUseCase(store);

    const result = await complete.execute({
      admin: { name: 'Setup Admin', email, password: 'password1' },
      llm: { provider: 'ollama', model: 'qwen3.5:4b' },
      access: { mode: 'lan' },
    });
    expect(result.user.email).toBe(email);
    expect((await status.execute()).completed).toBe(true);

    delete process.env.LLM_GATEWAY;
    delete process.env.SETUP_COMPLETED;
    store.invalidate();
    await store.applyOverridesToEnv();
    expect(process.env.SETUP_COMPLETED).toBe('true');
    expect(process.env.LLM_GATEWAY).toBe('ollama');
    expect(buildPublicRuntimeConfig().setupCompleted).toBe(true);

    await expect(
      complete.execute({
        admin: { name: 'Other', email: `other-${randomUUID()}@example.com`, password: 'password1' },
        llm: { provider: 'ollama' },
        access: { mode: 'lan' },
      }),
    ).rejects.toMatchObject({ code: 'SETUP_ALREADY_COMPLETED' } satisfies Partial<AppError>);
  });
});
