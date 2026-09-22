import { Request, Response } from 'express';
import { ProductController } from '../infrastructure/http/controllers/ProductController';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { Product } from '../domain/entities/Product';
import { ProductCategory } from '@prisma/client';
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

  describe('updateAdministrativeStatus', () => {
    it('should update only pesticide products from lookup and reset non-pesticide to null', async () => {
      const now = new Date();
      const pesticideProduct = new Product(
        'p1',
        'Abion E',
        'SKU-1',
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
      const fertilizerProduct = new Product(
        'p2',
        'Concime NPK',
        'SKU-2',
        null,
        ProductCategory.FERTILIZER,
        'Type',
        null,
        'Revocato',
        null,
        null,
        null,
        'w1',
        now,
        now,
      );
      const fitosanitariService = FitosanitariLookupService.getInstance();
      const lookupSpy = jest.spyOn(fitosanitariService, 'lookupStatus').mockReturnValue('Revocato');
      (mockRepository.findAllByUserId as unknown as jest.Mock) = jest
        .fn()
        .mockResolvedValue([pesticideProduct, fertilizerProduct]);
      (mockRepository.updateAdministrativeStatusBulk as unknown as jest.Mock) = jest
        .fn()
        .mockResolvedValue(2);
      mockRequest = { user: { id: 'u1' } };

      await controller.updateAdministrativeStatus(mockRequest as Request, mockResponse as Response);

      expect(lookupSpy).toHaveBeenCalledTimes(1);
      expect(lookupSpy).toHaveBeenCalledWith('000001', 'Abion E');
      expect(mockRepository.updateAdministrativeStatusBulk).toHaveBeenCalledWith([
        { id: 'p1', administrativeStatus: 'Revocato' },
        { id: 'p2', administrativeStatus: null },
      ]);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          productsUpdated: 2,
          totalProducts: 2,
        },
      });
      lookupSpy.mockRestore();
    });
  });});
