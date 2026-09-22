import { Request, Response } from 'express';
import { ProductController } from '../infrastructure/http/controllers/ProductController';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { Product } from '../domain/entities/Product';
import { ProductCategory } from '@prisma/client';
import { AppError } from '../domain/errors/AppError';
import { IStockRepository } from '../domain/repositories/IStockRepository';
import { CreateProductDTO } from '../application/use-cases/product/CreateProductUseCase';

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

  describe('create', () => {
    it('should create a product for authenticated user', async () => {
      const now = new Date();
      const created = new Product(
        'p1',
        'Prod',
        'SKU1',
        null,
        ProductCategory.SEED,
        'Type',
        'Desc',
        null,
        null,
        null,
        null,
        'w1',
        now,
        now,
      );

      mockRequest = {
        body: {
          warehouseId: 'w1',
          name: 'Prod',
          sku: 'SKU1',
          category: ProductCategory.SEED,
          type: 'Type',
        },
        user: { id: 'u1' },
      };

      mockRepository.create.mockResolvedValue(created);

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { product: created },
      });
    });

    it('should reject unauthenticated', async () => {
      mockRequest = { body: {}, user: undefined };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should reject missing fields', async () => {
      mockRequest = { body: { warehouseId: 'w1' }, user: { id: 'u1' } };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should create a product and an optional stock when provided', async () => {
      const now = new Date();
      const createdProduct = new Product(
        'p1',
        'Prod',
        'SKU1',
        null,
        ProductCategory.SEED,
        'Type',
        'Desc',
        null,
        null,
        null,
        null,
        'w1',
        now,
        now,
      );

      const mockStockRepository: jest.Mocked<IStockRepository> = {
        create: jest.fn(),
      } as unknown as jest.Mocked<IStockRepository>;

      // Recreate controller with stock repo wired
      controller = new ProductController(mockRepository, mockStockRepository);

      mockRequest = {
        body: {
          warehouseId: 'w1',
          name: 'Prod',
          sku: 'SKU1',
          category: ProductCategory.SEED,
          type: 'Type',
          stock: {
            quantity: 5,
            unitOfMeasureQuantity: 'kg',
            price: 10,
            unitOfMeasurePrice: 'EUR',
            type: 'IN',
            ddtCode: 'DDT123',
            invoiceDate: now,
          },
        },
        user: { id: 'u1' },
      };

      mockRepository.create.mockResolvedValue(createdProduct);

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockStockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { product: createdProduct },
      });
    });
  });

  describe('createBulk', () => {
    it('should create multiple products in the same warehouse', async () => {
      const now = new Date();
      new Product(
        'p1',
        'ProdA',
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
      new Product(
        'p2',
        'ProdB',
        'SKU2',
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

      const mockStockRepository: jest.Mocked<IStockRepository> = {
        create: jest.fn(),
        createMany: jest.fn(),
      } as unknown as jest.Mocked<IStockRepository>;

      controller = new ProductController(mockRepository, mockStockRepository);

      const products: Array<Omit<CreateProductDTO, 'warehouseId'>> = [
        {
          name: 'ProdA',
          sku: 'SKU1',
          barcode: null,
          category: ProductCategory.SEED,
          type: 'Type',
          description: null,
          registrationNumber: null,
          labelUrl: null,
          labelMetadata: null,
          stock: {
            quantity: 1,
            unitOfMeasureQuantity: 'kg',
            price: 1,
            unitOfMeasurePrice: 'EUR',
            type: 'IN',
            ddtCode: 'DDT123',
            invoiceDate: now,
          },
        },
        {
          name: 'ProdB',
          sku: 'SKU2',
          barcode: null,
          category: ProductCategory.SEED,
          type: 'Type',
          description: null,
          registrationNumber: null,
          labelUrl: null,
          labelMetadata: null,
        },
      ];

      const req = {
        body: { warehouseId: 'w1', products },
        user: { id: 'u1' },
      } as unknown as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      await controller.createBulk(req, res);

      expect(mockRepository.createMany).toHaveBeenCalledTimes(1);
      expect(mockStockRepository.createMany).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });
  });});
