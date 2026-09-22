import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureUserRole } from '../middlewares/ensureUserRole';
import { bulkExtractRateLimiter } from '../middlewares/rateLimiter';
import { DisciplinariController } from '../controllers/DisciplinariController';
import { upload } from '../../services/Multer';

const DISCIPLINARI_MODIFY_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.GOD,
  UserRole.LABEL_MANAGER,
];

export const disciplinariRouter = Router();
const controller = new DisciplinariController();

disciplinariRouter.post(
  '/extract-data-from-disciplinari',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(async (req, res) => controller.bulkExtractFromPdfFilesAsync(req, res)),
);

disciplinariRouter.get(
  '/job-status/:jobId',
  asyncHandler(async (req, res) => controller.getJobStatus(req, res)),
);

disciplinariRouter.get(
  '/summary',
  asyncHandler(async (req, res) => controller.listSummary(req, res)),
);

disciplinariRouter.get(
  '/expired',
  asyncHandler(async (req, res) => controller.listExpired(req, res)),
);

disciplinariRouter.get(
  '/expiring-soon',
  asyncHandler(async (req, res) => controller.listExpiringSoon(req, res)),
);

disciplinariRouter.get(
  '/check-validity',
  asyncHandler(async (req, res) => controller.checkValidity(req, res)),
);

disciplinariRouter.get(
  '/search',
  asyncHandler(async (req, res) => controller.searchByRegionAndYear(req, res)),
);

disciplinariRouter.get(
  '/stats',
  asyncHandler(async (req, res) => controller.getStats(req, res)),
);

disciplinariRouter.post(
  '/update-expired-status',
  ensureAuthenticated,
  ensureUserRole(DISCIPLINARI_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.updateExpiredStatus(req, res)),
);

disciplinariRouter.delete(
  '/bulk',
  ensureAuthenticated,
  ensureUserRole(DISCIPLINARI_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.bulkDelete(req, res)),
);

disciplinariRouter.get(
  '/:id',
  asyncHandler(async (req, res) => controller.getById(req, res)),
);

disciplinariRouter.delete(
  '/:id',
  ensureAuthenticated,
  ensureUserRole(DISCIPLINARI_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.delete(req, res)),
);
