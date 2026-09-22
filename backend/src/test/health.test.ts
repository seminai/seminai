import { HealthController } from '../infrastructure/http/controllers/HealthController';
import { CheckHealthUseCase } from '../application/use-cases/health/CheckHealthUseCase';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

jest.mock('../application/use-cases/health/CheckHealthUseCase');

describe('HealthController', () => {
  let healthController: HealthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let checkHealthUseCase: jest.Mocked<CheckHealthUseCase>;

  beforeEach(() => {
    checkHealthUseCase = jest.mocked(new CheckHealthUseCase({} as PrismaClient));

    healthController = new HealthController(checkHealthUseCase);

    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkHealth', () => {
    it('should return 200 with healthy status when all services are running', async () => {
      const inputHealthStatus = {
        status: 'healthy' as const,
        timestamp: '2025-11-13T12:00:00.000Z',
        uptime: 123.456,
        database: {
          status: 'up' as const,
          responseTime: 45,
        },
        redis: {
          status: 'up' as const,
          responseTime: 2,
        },
        services: {
          server: true,
          prisma: true,
          redis: true,
        },
      };

      checkHealthUseCase.execute.mockResolvedValue(inputHealthStatus);

      await healthController.checkHealth(mockRequest as Request, mockResponse as Response);

      expect(checkHealthUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: inputHealthStatus,
      });
    });

    it('should return 503 with unhealthy status when database is disconnected', async () => {
      const inputHealthStatus = {
        status: 'unhealthy' as const,
        timestamp: '2025-11-13T12:00:00.000Z',
        uptime: 123.456,
        database: {
          status: 'down' as const,
          error: 'Database connection failed',
        },
        redis: {
          status: 'up' as const,
          responseTime: 2,
        },
        services: {
          server: true,
          prisma: false,
          redis: true,
        },
      };

      checkHealthUseCase.execute.mockResolvedValue(inputHealthStatus);

      await healthController.checkHealth(mockRequest as Request, mockResponse as Response);

      expect(checkHealthUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: inputHealthStatus,
      });
    });

    it('should return 503 when health check throws an error', async () => {
      checkHealthUseCase.execute.mockRejectedValue(new Error('Database connection failed'));

      await healthController.checkHealth(mockRequest as Request, mockResponse as Response);

      expect(checkHealthUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          message: 'Health check failed',
          data: expect.objectContaining({
            status: 'unhealthy',
          }),
        }),
      );
    });
  });

  describe('wakeUp', () => {
    it('should return 200 with wake up message when server is ready', async () => {
      const inputHealthStatus = {
        status: 'healthy' as const,
        timestamp: '2025-11-13T12:00:00.000Z',
        uptime: 123.456,
        database: {
          status: 'up' as const,
          responseTime: 45,
        },
        redis: {
          status: 'up' as const,
          responseTime: 2,
        },
        services: {
          server: true,
          prisma: true,
          redis: true,
        },
      };

      checkHealthUseCase.execute.mockResolvedValue(inputHealthStatus);

      await healthController.wakeUp(mockRequest as Request, mockResponse as Response);

      expect(checkHealthUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          message: 'Server is awake and ready',
          ...inputHealthStatus,
        },
      });
    });

    it('should return 503 when server is starting up', async () => {
      checkHealthUseCase.execute.mockRejectedValue(new Error('Connection not ready'));

      await healthController.wakeUp(mockRequest as Request, mockResponse as Response);

      expect(checkHealthUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server is starting up, please retry in a few seconds',
        data: expect.objectContaining({
          status: 'starting',
        }),
      });
    });
  });
});
