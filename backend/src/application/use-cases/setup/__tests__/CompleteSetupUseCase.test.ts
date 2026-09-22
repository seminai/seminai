import { UserRole } from '@prisma/client';
import { CompleteSetupUseCase } from '../CompleteSetupUseCase';
import { AppError } from '../../../../domain/errors/AppError';
import type { IUserRepository } from '../../../../domain/repositories/IUserRepository';
import type { EncryptedSettingStore } from '../../../../infrastructure/settings/encryptedSettingStore';
import { User } from '../../../../domain/entities/User';

function memorySettings(): EncryptedSettingStore & { values: Map<string, string> } {
  const values = new Map<string, string>([['setup.completed', 'false']]);
  return {
    values,
    async get(key: string, fallback = '') {
      return values.get(key) ?? fallback;
    },
    async set(key: string, plaintext: string) {
      values.set(key, plaintext);
    },
    invalidate() {
      values.clear();
    },
    async applyOverridesToEnv() {
      process.env.SETUP_COMPLETED = values.get('setup.completed');
      process.env.LLM_GATEWAY = values.get('llm.provider');
    },
  };
}

function userRepo(): IUserRepository {
  const users: User[] = [];
  return {
    async create(user) {
      users.push(user);
      return user;
    },
    async findByEmail(email) {
      return users.find((user) => user.email === email) ?? null;
    },
    async findById(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async findByPhoneNumber() {
      return null;
    },
    async findByGoogleId() {
      return null;
    },
    async update(id, patch) {
      const index = users.findIndex((user) => user.id === id);
      const current = users[index];
      const next = Object.assign(current, patch) as User;
      users[index] = next;
      return next;
    },
    async delete() {},
    async deductCredits(id) {
      return users.find((user) => user.id === id) as User;
    },
  };
}

describe('CompleteSetupUseCase', () => {
  const originalJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'k'.repeat(40);
  });

  afterEach(() => {
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
  });

  it('creates a GOD admin and locks further setup', async () => {
    const settings = memorySettings();
    const useCase = new CompleteSetupUseCase(userRepo(), settings);
    const result = await useCase.execute({
      admin: { name: 'Ada', email: 'ada@example.com', password: 'password1' },
      llm: { provider: 'ollama', model: 'qwen3.5:4b' },
      access: { mode: 'lan' },
    });
    expect(result.user.role).toBe(UserRole.GOD);
    expect(result.token.length).toBeGreaterThan(10);
    expect(await settings.get('setup.completed')).toBe('true');

    await expect(
      useCase.execute({
        admin: { name: 'Bob', email: 'bob@example.com', password: 'password1' },
        llm: { provider: 'ollama' },
        access: { mode: 'lan' },
      }),
    ).rejects.toMatchObject({ code: 'SETUP_ALREADY_COMPLETED' } satisfies Partial<AppError>);
  });
});
