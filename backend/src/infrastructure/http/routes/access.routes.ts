import { Router } from 'express';
import { AccessController } from '../controllers/AccessController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authRateLimiter } from '../middlewares/rateLimiter';

const accessRouter = Router();
const controller = new AccessController();

accessRouter.get(
  '/status',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.status(req, res)),
);

accessRouter.post(
  '/invite',
  ensureAuthenticated,
  authRateLimiter,
  asyncHandler((req, res) => controller.rotateInvite(req, res)),
);

export { accessRouter };
