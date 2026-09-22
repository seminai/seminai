import { Router } from 'express';
import { CheckHealthUseCase } from '../../../application/use-cases/health/CheckHealthUseCase';
import { HealthController } from '../controllers/HealthController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const healthRouter = Router();

const checkHealthUseCase = new CheckHealthUseCase(prisma);
const healthController = new HealthController(checkHealthUseCase);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check server and database health status
 *     description: Returns detailed health status of the server and its dependencies (database, services)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: healthy
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                       description: Server uptime in seconds
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: connected
 *                         responseTime:
 *                           type: number
 *                           description: Database response time in milliseconds
 *                     services:
 *                       type: object
 *                       properties:
 *                         server:
 *                           type: boolean
 *                         prisma:
 *                           type: boolean
 *       503:
 *         description: Server is unhealthy
 */
healthRouter.get('/health', asyncHandler(healthController.checkHealth.bind(healthController)));

/**
 * @swagger
 * /wake-up:
 *   get:
 *     summary: Wake up the server
 *     description: Endpoint to activate/wake up the server and verify all services are ready. Useful for pay-as-you-go deployments.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is awake and ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Server is awake and ready
 *                     status:
 *                       type: string
 *                       example: healthy
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                     database:
 *                       type: object
 *                     services:
 *                       type: object
 *       503:
 *         description: Server is starting up
 */
healthRouter.get('/wake-up', asyncHandler(healthController.wakeUp.bind(healthController)));

export { healthRouter };
