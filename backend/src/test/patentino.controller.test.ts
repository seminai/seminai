import { Request, Response } from 'express';
import { PatentinoController } from '../infrastructure/http/controllers/PatentinoController';
import { IPatentinoRepository } from '../domain/repositories/IPatentinoRepository';
import { ResourceAccessGuard } from '../application/use-cases/access/ResourceAccessGuard';
import { Patentino } from '../domain/entities/Patentino';
import { AppError } from '../domain/errors/AppError';

describe('PatentinoController', () => {
  let controller: PatentinoController;
  let mockRepository: jest.Mocked<IPatentinoRepository>;
  let mockAccess: jest.Mocked<ResourceAccessGuard>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findManyByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IPatentinoRepository>;
    mockAccess = {
      assertPatentino: jest.fn(),
    } as unknown as jest.Mocked<ResourceAccessGuard>;

    controller = new PatentinoController(mockRepository, mockAccess);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('create', () => {
    it('should create a patentino with valid data', async () => {
      mockRequest = {
        user: { id: 'user-1' },
        body: {
          type: 'A',
          code: 'ABCD-1234',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          releaseAt: new Date().toISOString(),
          isActive: true,
          userId: 'another-user',
        },
      };

      mockRepository.findByCode.mockResolvedValue(null);

      const created = new Patentino(
        'p1',
        'A',
        'ABCD-1234',
        new Date(Date.now() + 86400000),
        new Date(),
        true,
        new Date(),
        new Date(),
        'user-1',
      );
      mockRepository.create.mockResolvedValue(created);

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.findByCode).toHaveBeenCalledWith('ABCD-1234');
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { patentino: created },
      });
    });

    it('should throw when required fields are missing', async () => {
      mockRequest = { body: { type: 'A' }, user: { id: 'user-1' } };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw when code already exists', async () => {
      mockRequest = {
        user: { id: 'user-1' },
        body: {
          type: 'A',
          code: 'DUPL-0001',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          releaseAt: new Date().toISOString(),
          userId: 'user-1',
        },
      };
      mockRepository.findByCode.mockResolvedValue({} as Patentino);
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('findById', () => {
    it('should return patentino', async () => {
      mockRequest = { params: { id: 'p1' }, user: { id: 'user-1' } };
      const found = new Patentino(
        'p1',
        'A',
        'CODE-1',
        new Date(),
        new Date(Date.now() - 86400000),
        true,
        new Date(),
        new Date(),
        'user-1',
      );
      mockAccess.assertPatentino.mockResolvedValue(found);

      await controller.findById(mockRequest as Request, mockResponse as Response);

      expect(mockAccess.assertPatentino).toHaveBeenCalledWith('user-1', 'p1');
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { patentino: found },
      });
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'missing' }, user: { id: 'user-1' } };
      mockAccess.assertPatentino.mockRejectedValue(
        AppError.notFound('Patentino not found', 'PATENTINO_NOT_FOUND'),
      );
      await expect(
        controller.findById(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('listByUser', () => {
    it('should list patentini by user', async () => {
      mockRequest = { params: { userId: 'user-1' }, user: { id: 'user-1' } };
      mockRepository.findManyByUserId.mockResolvedValue([]);

      await controller.listByUser(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.findManyByUserId).toHaveBeenCalledWith('user-1');
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { patentini: [] },
      });
    });

    it('should reject listing another user patentini', async () => {
      mockRequest = { params: { userId: 'user-2' }, user: { id: 'user-1' } };
      await expect(
        controller.listByUser(mockRequest as Request, mockResponse as Response),
      ).rejects.toMatchObject({ statusCode: 403, code: 'PATENTINO_ACCESS_DENIED' });
    });
  });

  describe('update', () => {
    it('should update a patentino', async () => {
      mockRequest = {
        params: { id: 'p1' },
        body: { code: 'NEWC-0002', isActive: false },
        user: { id: 'user-1' },
      };
      const existing = new Patentino(
        'p1',
        'A',
        'OLDC-0001',
        new Date(Date.now() + 86400000),
        new Date(),
        true,
        new Date(),
        new Date(),
        'user-1',
      );
      const updated = new Patentino(
        'p1',
        'A',
        'NEWC-0002',
        new Date(Date.now() + 86400000),
        new Date(),
        false,
        new Date(),
        new Date(),
        'user-1',
      );
      mockAccess.assertPatentino.mockResolvedValue(existing);
      mockRepository.findByCode.mockResolvedValue(null);
      mockRepository.update.mockResolvedValue(updated);

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.update).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { patentino: updated },
      });
    });

    it('should throw when patentino not found', async () => {
      mockRequest = { params: { id: 'missing' }, body: {}, user: { id: 'user-1' } };
      mockAccess.assertPatentino.mockRejectedValue(
        AppError.notFound('Patentino not found', 'PATENTINO_NOT_FOUND'),
      );
      await expect(
        controller.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('delete', () => {
    it('should delete patentino', async () => {
      mockRequest = { params: { id: 'p1' }, user: { id: 'user-1' } };
      mockAccess.assertPatentino.mockResolvedValue({} as Patentino);
      mockRepository.delete.mockResolvedValue();

      await controller.delete(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.delete).toHaveBeenCalledWith('p1');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'missing' }, user: { id: 'user-1' } };
      mockAccess.assertPatentino.mockRejectedValue(
        AppError.notFound('Patentino not found', 'PATENTINO_NOT_FOUND'),
      );
      await expect(
        controller.delete(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });
});
