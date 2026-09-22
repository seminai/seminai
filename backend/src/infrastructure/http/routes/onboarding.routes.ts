import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { asyncHandler } from '../middlewares/asyncHandler';
import { startJobRateLimiter } from '../middlewares/rateLimiter';
import { upload } from '../../services/Multer';
import { OnboardingController } from '../controllers/OnboardingController';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { prisma } from '../../repositories/Prisma';

const router = Router();

const fieldRepository = new PrismaFieldRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
const controller = new OnboardingController(fieldRepository, productionUnitRepository);

router.post(
  '/extract',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => controller.extractFromFile(req, res)),
);

router.post(
  '/extract/start',
  ensureAuthenticated,
  upload.single('file'),
  startJobRateLimiter,
  asyncHandler((req, res) => controller.startExtractJob(req, res)),
);

router.get(
  '/extract/status/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getExtractJobStatus(req, res)),
);

router.get(
  '/extract/result/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getExtractJobResult(req, res)),
);

router.delete(
  '/extract/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.cancelExtractJob(req, res)),
);

router.post(
  '/bulk-create',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.bulkCreateFieldsAndProductionUnits(req, res)),
);

/**
 * @openapi
 * /onboarding/predict-phenology:
 *   post:
 *     summary: Predict flowering and harvesting dates for production units via LLM
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productionUnits
 *             properties:
 *               productionUnits:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - index
 *                     - cropName
 *                   properties:
 *                     index:
 *                       type: number
 *                     cropName:
 *                       type: string
 *                     cropType:
 *                       type: string
 *                     variety:
 *                       type: string
 *                     location:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *     responses:
 *       200:
 *         description: Predicted phenological dates
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/predict-phenology',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.predictPhenology(req, res)),
);

export { router as onboardingRouter };
