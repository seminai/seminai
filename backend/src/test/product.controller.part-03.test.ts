import { Request, Response } from 'express';
import { ProductController } from '../infrastructure/http/controllers/ProductController';
import { IProductRepository, ProductWithRelations } from '../domain/repositories/IProductRepository';
import { Product } from '../domain/entities/Product';
import { ProductCategory } from '@prisma/client';
import { AppError } from '../domain/errors/AppError';
import { FitosanitariLookupService } from '../infrastructure/services/utils/FitosanitariLookupService';

describe('ProductController listByUser', () => {
  it('should list products with stocks for authenticated user', async () => {
    const controller = new ProductController({
      findManyByUserId: jest.fn().mockResolvedValue([
        {
          id: 'p1',
          name: 'A',
          sku: 'SKU1',
          barcode: null,
          category: ProductCategory.SEED,
          type: 'Type',
          description: null,
          registrationNumber: null,
          labelUrl: null,
          labelMetadata: null,
          warehouseId: 'w1',
          createdAt: new Date(),
          updatedAt: new Date(),
          stocks: [],
        },
      ]),
    } as unknown as IProductRepository);

    const req = { user: { id: 'u1' } } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response;
    await controller.listByUser(req, res);
    expect(res.json).toHaveBeenCalled();
  });
});
describe('ProductController', () => {
  let controller: ProductController;
  let mockRepository: jest.Mocked<IProductRepository>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByWarehouseId: jest.fn(),
      findManyByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IProductRepository>;

    controller = new ProductController(mockRepository);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('update', () => {
    it('should update existing product', async () => {
      const now = new Date();
      const existing = new Product(
        'p1',
        'A',
        'SKU1',
        null,
        ProductCategory.SEED,
        'Type',
        null,
        null,
        null,
        null,
        null,
        'w1',
        now,
        now,
      );
      const updated = new Product(
        'p1',
        'B',
        'SKU1',
        null,
        ProductCategory.SEED,
        'NewType',
        null,
        null,
        null,
        null,
        null,
        'w1',
        now,
        now,
      );
      mockRequest = { params: { id: 'p1' }, body: { name: 'B', type: 'NewType' } };
      mockRepository.findById.mockResolvedValue({
        ...existing,
        stocks: [],
      } as unknown as ProductWithRelations);
      mockRepository.update.mockResolvedValue(updated);

      await controller.update(mockRequest as Request, mockResponse as Response);
      expect(mockRepository.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          name: 'B',
          type: 'NewType',
          category: ProductCategory.SEED,
          registrationNumber: null,
          administrativeStatus: null,
        }),
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { product: updated },
      });
    });

    it('should always recalculate administrativeStatus for pesticide products', async () => {
      const now = new Date();
      const existing = new Product(
        'p1',
        'ABION E',
        'SKU1',
        null,
        ProductCategory.PESTICIDE,
        'Type',
        null,
        null,
        '000001',
        null,
        null,
        'w1',
        now,
        now,
      );
      const updated = new Product(
        'p1',
        'ABION E',
        'SKU1',
        null,
        ProductCategory.PESTICIDE,
        'NewType',
        null,
        'Revocato',
        '000001',
        null,
        null,
        'w1',
        now,
        now,
      );
      const fitosanitariService = FitosanitariLookupService.getInstance();
      const lookupSpy = jest.spyOn(fitosanitariService, 'lookupStatus').mockReturnValue('Revocato');
      mockRequest = { params: { id: 'p1' }, body: { type: 'NewType' } };
      mockRepository.findById.mockResolvedValue({
        ...existing,
        stocks: [],
      } as unknown as ProductWithRelations);
      mockRepository.update.mockResolvedValue(updated);

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(lookupSpy).toHaveBeenCalledWith('000001', 'ABION E');
      expect(mockRepository.update).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          category: ProductCategory.PESTICIDE,
          registrationNumber: '000001',
          administrativeStatus: 'Revocato',
        }),
      );
      lookupSpy.mockRestore();
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'p1' }, body: {} };
      mockRepository.findById.mockResolvedValue(null);
      await expect(
        controller.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('delete', () => {
    it('should delete existing product', async () => {
      const now = new Date();
      const existing = new Product(
        'p1',
        'A',
        'SKU1',
        null,
        ProductCategory.SEED,
        'Type',
        null,
        null,
        null,
        null,
        null,
        'w1',
        now,
        now,
      );
      mockRequest = { params: { id: 'p1' } };
      mockRepository.findById.mockResolvedValue({
        ...existing,
        stocks: [],
      } as unknown as ProductWithRelations);
      mockRepository.delete.mockResolvedValue();

      await controller.delete(mockRequest as Request, mockResponse as Response);
      expect(mockRepository.delete).toHaveBeenCalledWith('p1');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'p1' } };
      mockRepository.findById.mockResolvedValue(null);
      await expect(
        controller.delete(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });});
