import { Request, Response } from 'express';
import { WarehouseController } from '../infrastructure/http/controllers/WarehouseController';
import { IWarehouseRepository } from '../domain/repositories/IWarehouseRepository';
import { Warehouse } from '../domain/entities/Warehouse';
import { ResourceAccessGuard } from '../application/use-cases/access/ResourceAccessGuard';
import { AppError } from '../domain/errors/AppError';

describe('WarehouseController', () => {
  let controller: WarehouseController;
  let mockRepository: jest.Mocked<IWarehouseRepository>;
  let mockAccess: jest.Mocked<ResourceAccessGuard>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findManyByCompanyId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IWarehouseRepository>;
    mockAccess = {
      assertWarehouse: jest.fn(),
    } as unknown as jest.Mocked<ResourceAccessGuard>;

    controller = new WarehouseController(mockRepository, mockAccess);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('create', () => {
    it('should create a warehouse for authenticated user', async () => {
      const now = new Date();
      const created = new Warehouse(
        'w1',
        'c1',
        'Main WH',
        'Via Roma 1',
        'Italia',
        'Lazio',
        'Roma',
        '00100',
        'S',
        '10',
        '100',
        '1',
        now,
        now,
      );

      mockRequest = {
        body: {
          companyId: 'c1',
          name: 'Main WH',
          nation: 'Italia',
          region: 'Lazio',
          city: 'Roma',
          address: 'Via Roma 1',
          cap: '00100',
          sezione: 'S',
          foglio: '10',
          particella: '100',
          subalterno: '1',
        },
        user: { id: 'u1' },
      };

      mockRepository.create.mockResolvedValue(created);

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { warehouse: created },
      });
    });

    it('should reject unauthenticated', async () => {
      mockRequest = { body: {}, user: undefined };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should create warehouse with only companyId and name (other fields default to empty)', async () => {
      const now = new Date();
      const created = new Warehouse(
        'w1',
        'c1',
        'magazzino fito',
        '',
        null,
        null,
        null,
        null,
        '',
        '',
        '',
        null,
        now,
        now,
      );
      mockRequest = {
        body: { companyId: 'c1', name: 'magazzino fito' },
        user: { id: 'u1' },
      };
      mockRepository.create.mockResolvedValue(created);
      await controller.create(mockRequest as Request, mockResponse as Response);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      const call = mockRepository.create.mock.calls[0][0];
      expect(call.name).toBe('magazzino fito');
      expect(call.companyId).toBe('c1');
      expect(call.address).toBe('');
      expect(call.sezione).toBe('');
      expect(call.foglio).toBe('');
      expect(call.particella).toBe('');
    });

    it('should reject missing companyId or name', async () => {
      mockRequest = { body: { name: 'x' }, user: { id: 'u1' } };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
      mockRequest = { body: { companyId: 'c1' }, user: { id: 'u1' } };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('findById', () => {
    it('should return warehouse when found', async () => {
      const now = new Date();
      const found = new Warehouse(
        'w1',
        'c1',
        'Main',
        'Addr',
        null,
        null,
        null,
        null,
        'S',
        'F',
        'P',
        null,
        now,
        now,
      );
      mockRequest = { params: { id: 'w1' }, user: { id: 'u1' } };
      mockAccess.assertWarehouse.mockResolvedValue(found);

      await controller.findById(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { warehouse: found },
      });
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'w1' }, user: { id: 'u1' } };
      mockAccess.assertWarehouse.mockRejectedValue(
        AppError.notFound('Warehouse not found', 'WAREHOUSE_NOT_FOUND'),
      );
      await expect(
        controller.findById(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should reject access to another company warehouse', async () => {
      mockRequest = { params: { id: 'w1' }, user: { id: 'u2' } };
      mockAccess.assertWarehouse.mockRejectedValue(
        AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS'),
      );
      await expect(
        controller.findById(mockRequest as Request, mockResponse as Response),
      ).rejects.toMatchObject({ statusCode: 403, code: 'NO_COMPANY_ACCESS' });
    });
  });

  describe('listByCompany', () => {
    it('should list warehouses', async () => {
      const now = new Date();
      const list = [
        new Warehouse(
          'w1',
          'c1',
          'A',
          'Addr',
          null,
          null,
          null,
          null,
          'S',
          'F',
          'P',
          null,
          now,
          now,
        ),
      ];
      mockRequest = { params: { companyId: 'c1' } };
      mockRepository.findManyByCompanyId.mockResolvedValue(list);

      await controller.listByCompany(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { warehouses: list },
      });
    });
  });

  describe('update', () => {
    it('should update existing warehouse', async () => {
      const now = new Date();
      const existing = new Warehouse(
        'w1',
        'c1',
        'A',
        'Addr',
        null,
        null,
        null,
        null,
        'S',
        'F',
        'P',
        null,
        now,
        now,
      );
      const updated = new Warehouse(
        'w1',
        'c1',
        'B',
        'Addr2',
        null,
        null,
        null,
        null,
        'S',
        'F',
        'P',
        null,
        now,
        now,
      );
      mockRequest = {
        params: { id: 'w1' },
        body: { name: 'B', address: 'Addr2' },
        user: { id: 'u1' },
      };
      mockAccess.assertWarehouse.mockResolvedValue(existing);
      mockRepository.update.mockResolvedValue(updated);

      await controller.update(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { warehouse: updated },
      });
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'w1' }, body: {}, user: { id: 'u1' } };
      mockAccess.assertWarehouse.mockRejectedValue(
        AppError.notFound('Warehouse not found', 'WAREHOUSE_NOT_FOUND'),
      );
      await expect(
        controller.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('delete', () => {
    it('should delete existing warehouse', async () => {
      const now = new Date();
      const existing = new Warehouse(
        'w1',
        'c1',
        'A',
        'Addr',
        null,
        null,
        null,
        null,
        'S',
        'F',
        'P',
        null,
        now,
        now,
      );
      mockRequest = { params: { id: 'w1' }, user: { id: 'u1' } };
      mockAccess.assertWarehouse.mockResolvedValue(existing);
      mockRepository.delete.mockResolvedValue();

      await controller.delete(mockRequest as Request, mockResponse as Response);
      expect(mockRepository.delete).toHaveBeenCalledWith('w1');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'w1' }, user: { id: 'u1' } };
      mockAccess.assertWarehouse.mockRejectedValue(
        AppError.notFound('Warehouse not found', 'WAREHOUSE_NOT_FOUND'),
      );
      await expect(
        controller.delete(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });
});
