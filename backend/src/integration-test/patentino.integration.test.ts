import { PrismaPatentinoRepository } from '../infrastructure/repositories/PrismaPatentinoRepository';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, deleteTestUser, clearPatentiniByUser } from './helpers';
import { Patentino } from '../domain/entities/Patentino';

describe('Patentino Integration Tests', () => {
  let patentinoRepository: PrismaPatentinoRepository;
  let testUserId: string;

  beforeAll(async () => {
    patentinoRepository = new PrismaPatentinoRepository(prisma);
    const testUser = await createTestUser();
    testUserId = testUser.id;
  });

  afterAll(async () => {
    await deleteTestUser();
    await cleanupTestData();
  });

  beforeEach(async () => {
    await clearPatentiniByUser(testUserId);
  });

  describe('Create and Read', () => {
    it('should create and fetch by id', async () => {
      const input = Patentino.create({
        type: 'A',
        code: `CODE-${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        releaseAt: new Date(),
        isActive: true,
        userId: testUserId,
      });

      const created = await patentinoRepository.create(input);
      expect(created.id).toBeDefined();

      const found = await patentinoRepository.findById(created.id);
      expect(found?.id).toBe(created.id);
      expect(found?.code).toBe(input.code);
    });

    it('should find by code and list by user', async () => {
      const input = Patentino.create({
        type: 'B',
        code: `X-${Date.now()}`,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        releaseAt: new Date(),
        isActive: true,
        userId: testUserId,
      });

      const created = await patentinoRepository.create(input);
      const byCode = await patentinoRepository.findByCode(created.code);
      expect(byCode?.id).toBe(created.id);

      const list = await patentinoRepository.findManyByUserId(testUserId);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Update and Delete', () => {
    it('should update fields', async () => {
      const input = Patentino.create({
        type: 'C',
        code: `U-${Date.now()}`,
        expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        releaseAt: new Date(),
        isActive: true,
        userId: testUserId,
      });

      const created = await patentinoRepository.create(input);

      const updated = await patentinoRepository.update(created.id, {
        isActive: false,
      });

      expect(updated.isActive).toBe(false);

      const db = await prisma.patentino.findUnique({ where: { id: created.id } });
      expect(db?.isActive).toBe(false);
    });

    it('should delete', async () => {
      const input = Patentino.create({
        type: 'D',
        code: `D-${Date.now()}`,
        expiresAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        releaseAt: new Date(),
        isActive: true,
        userId: testUserId,
      });
      const created = await patentinoRepository.create(input);

      await patentinoRepository.delete(created.id);

      const found = await patentinoRepository.findById(created.id);
      expect(found).toBeNull();
    });
  });
});
