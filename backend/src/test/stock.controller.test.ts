import { Request, Response } from 'express';
import { StockController } from '../infrastructure/http/controllers/StockController';
import { IStockRepository } from '../domain/repositories/IStockRepository';
import { Stock } from '../domain/entities/Stock';
import { AppError } from '../domain/errors/AppError';

describe('StockController', () => {
  let controller: StockController;
  let mockRepository: jest.Mocked<IStockRepository>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
    } as unknown as jest.Mocked<IStockRepository>;

    controller = new StockController(mockRepository);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('create', () => {
    it('should create a stock movement for authenticated user', async () => {
      const now = new Date();
      const created = new Stock(
        's1',
        'p1',
        null,
        10,
        'kg',
        100,
        'EUR',
        'IN',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        now,
        now,
      );

      mockRequest = {
        body: {
          companyId: 'c1',
          productId: 'p1',
          quantity: 10,
          unitOfMeasureQuantity: 'kg',
          price: 100,
          unitOfMeasurePrice: 'EUR',
          type: 'IN',
        },
        user: { id: 'u1' },
      };

      mockRepository.create.mockResolvedValue(created);

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { stock: created },
      });
    });

    it('should reject unauthenticated', async () => {
      mockRequest = { body: {}, user: undefined };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should reject missing fields', async () => {
      mockRequest = { body: { companyId: 'c1', productId: 'p1' }, user: { id: 'u1' } };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });
});
