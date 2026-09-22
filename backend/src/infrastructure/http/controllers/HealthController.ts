import { Request, Response } from 'express';
import { CheckHealthUseCase } from '../../../application/use-cases/health/CheckHealthUseCase';
import { logger } from '../../services/logger.service';

export class HealthController {
  constructor(private readonly checkHealthUseCase: CheckHealthUseCase) {}

  async checkHealth(_request: Request, response: Response): Promise<Response> {
    try {
      const healthStatus = await this.checkHealthUseCase.execute();
      const statusCode = healthStatus.status === 'unhealthy' ? 503 : 200;
      return response.status(statusCode).json({
        status: 'success',
        data: healthStatus,
      });
    } catch (error) {
      logger.error('Health check failed', { error: String(error) });
      return response.status(503).json({
        status: 'error',
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        },
        message: 'Health check failed',
      });
    }
  }

  async wakeUp(_request: Request, response: Response): Promise<Response> {
    try {
      const healthStatus = await this.checkHealthUseCase.execute();
      return response.status(200).json({
        status: 'success',
        data: {
          message: 'Server is awake and ready',
          ...healthStatus,
        },
      });
    } catch (error) {
      logger.error('Wake-up check failed', { error: String(error) });
      return response.status(503).json({
        status: 'error',
        message: 'Server is starting up, please retry in a few seconds',
        data: {
          status: 'starting',
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}
