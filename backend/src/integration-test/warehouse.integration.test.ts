import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteTestCompany,
  clearWarehousesByCompany,
} from './helpers';
import { Warehouse } from '../domain/entities/Warehouse';

describe('Warehouse Integration Tests', () => {
  let warehouseRepository: PrismaWarehouseRepository;
  let testUserId: string;
  let testCompanyId: string;

  beforeAll(async () => {
    warehouseRepository = new PrismaWarehouseRepository(prisma);
    const testUser = await createTestUser();
    testUserId = testUser.id;
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id;
  });

  afterAll(async () => {
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  beforeEach(async () => {
    await clearWarehousesByCompany(testCompanyId);
  });

  describe('Create and Read', () => {
    it('should create and fetch by id', async () => {
      const input = Warehouse.create({
        companyId: testCompanyId,
        name: `WH-${Date.now()}`,
        nation: 'Italia',
        region: 'Lazio',
        city: 'Roma',
        address: 'Via Roma 1',
        cap: '00100',
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: '1',
      });

      const created = await warehouseRepository.create(input);
      expect(created.id).toBeDefined();

      const found = await warehouseRepository.findById(created.id);
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe(input.name);
    });

    it('should list by company', async () => {
      const input = Warehouse.create({
        companyId: testCompanyId,
        name: `WH-${Date.now()}`,
        nation: 'Italia',
        region: 'Lazio',
        city: 'Roma',
        address: 'Via Roma 1',
        cap: '00100',
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: '1',
      });
      await warehouseRepository.create(input);
      const list = await warehouseRepository.findManyByCompanyId(testCompanyId);
      expect(list.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Update and Delete', () => {
    it('should update fields', async () => {
      const input = Warehouse.create({
        companyId: testCompanyId,
        name: `WH-${Date.now()}`,
        nation: 'Italia',
        region: 'Lazio',
        city: 'Roma',
        address: 'Via Roma 1',
        cap: '00100',
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: '1',
      });
      const created = await warehouseRepository.create(input);

      const updated = await warehouseRepository.update(created.id, {
        name: 'Updated Name',
        address: 'Via Milano 5',
      });

      expect(updated.name).toBe('Updated Name');
      const db = await prisma.warehouse.findUnique({ where: { id: created.id } });
      expect(db?.name).toBe('Updated Name');
      expect(db?.address).toBe('Via Milano 5');
    });

    it('should delete', async () => {
      const input = Warehouse.create({
        companyId: testCompanyId,
        name: `WH-${Date.now()}`,
        nation: 'Italia',
        region: 'Lazio',
        city: 'Roma',
        address: 'Via Roma 1',
        cap: '00100',
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: '1',
      });
      const created = await warehouseRepository.create(input);

      await warehouseRepository.delete(created.id);
      const found = await warehouseRepository.findById(created.id);
      expect(found).toBeNull();
    });
  });
});
