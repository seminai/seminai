import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { PrismaNotificationRepository } from '../../repositories/PrismaNotificationRepository';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const notificationRouter = Router();
const notificationRepository = new PrismaNotificationRepository(prisma);
const controller = new NotificationController(notificationRepository);

notificationRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

notificationRouter.get(
  '/unread-count',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.countUnread(req, res)),
);

notificationRouter.patch(
  '/read-all',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.markAllAsRead(req, res)),
);

notificationRouter.patch(
  '/:id/read',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.markAsRead(req, res)),
);

export { notificationRouter };
