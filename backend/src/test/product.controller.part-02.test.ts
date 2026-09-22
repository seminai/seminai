import { Request, Response } from 'express';
import { ProductController } from '../infrastructure/http/controllers/ProductController';
import { IProductRepository, ProductWithRelations } from '../domain/repositories/IProductRepository';
import { ProductCategory } from '@prisma/client';
import { AppError } from '../domain/errors/AppError';
import { Prisma } from '@prisma/client';

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

  describe('findById', () => {
    it('should return product when found', async () => {
      const now = new Date();
      const found: Prisma.ProductGetPayload<{ include: { stocks: true } }> = {
        id: 'p1',
        name: 'Prod',
        sku: 'SKU1',
        barcode: null,
        category: ProductCategory.SEED,
        type: 'Type',
        description: 'Desc',
        administrativeStatus: null,
        registrationNumber: null,
        labelUrl: null,
        labelMetadata: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        magnesium: null,
        calcium: null,
        sulfur: null,
        boron: null,
        unitOfFertilizer: null,
        warehouseId: 'w1',
        vintage: null,
        unitPrice: null,
        vatRate: null,
        unitOfMeasure: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        stocks: [],
      };
      mockRequest = { params: { id: 'p1' } };
      mockRepository.findById.mockResolvedValue(found as unknown as ProductWithRelations);

      await controller.findById(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { product: { ...found, principioAttivo: null } },
      });
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 'p1' } };
      mockRepository.findById.mockResolvedValue(null);
      await expect(
        controller.findById(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('listByWarehouse', () => {
    it('should list products', async () => {
      const now = new Date();
      const list: Prisma.ProductGetPayload<{ include: { stocks: true } }>[] = [
        {
          id: 'p1',
          name: 'A',
          sku: 'SKU1',
          barcode: null,
          category: ProductCategory.SEED,
          type: 'Type',
          description: null,
          administrativeStatus: null,
          registrationNumber: null,
          labelUrl: null,
          labelMetadata: null,
          nitrogen: null,
          phosphorus: null,
          potassium: null,
          magnesium: null,
          calcium: null,
          sulfur: null,
          boron: null,
          unitOfFertilizer: null,
          warehouseId: 'w1',
          vintage: null,
          unitPrice: null,
          vatRate: null,
          unitOfMeasure: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          stocks: [],
        },
      ];
      mockRequest = { params: { warehouseId: 'w1' } };
      mockRepository.findManyByWarehouseId.mockResolvedValue(
        list as unknown as ProductWithRelations[],
      );

      await controller.listByWarehouse(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { products: list.map((p) => ({ ...p, principioAttivo: null })) },
      });
    });
  });});
