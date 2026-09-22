import { Router } from 'express';
import { SetupController } from '../controllers/SetupController';
import { GetSetupStatusUseCase } from '../../../application/use-cases/setup/GetSetupStatusUseCase';
import { CompleteSetupUseCase } from '../../../application/use-cases/setup/CompleteSetupUseCase';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { getInstanceSettingStore } from '../../settings/instanceSettingSingleton';
import { prisma } from '../../repositories/Prisma';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authRateLimiter } from '../middlewares/rateLimiter';

const setupRouter = Router();
const settings = getInstanceSettingStore();
const controller = new SetupController(
  new GetSetupStatusUseCase(settings),
  new CompleteSetupUseCase(new PrismaUserRepository(prisma), settings),
);

setupRouter.get('/status', asyncHandler((req, res) => controller.status(req, res)));
setupRouter.get('/detect-ollama', asyncHandler((req, res) => controller.detect(req, res)));
setupRouter.post(
  '/complete',
  authRateLimiter,
  asyncHandler((req, res) => controller.complete(req, res)),
);

export { setupRouter };
