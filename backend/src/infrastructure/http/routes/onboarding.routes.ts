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

/**
 * @swagger
 * /onboarding/extract:
 *   post:
 *     summary: Extract fields and production units from a CSV/Excel file
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV or Excel file with agricultural field data
 *     responses:
 *       200:
 *         description: Extracted fields and production units preview
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
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                     fieldCount:
 *                       type: number
 *                     productionUnitCount:
 *                       type: number
 *       400:
 *         description: Missing file
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/extract',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => controller.extractFromFile(req, res)),
);

/**
 * @swagger
 * /onboarding/extract/start:
 *   post:
 *     summary: Start async extraction job from a file (returns jobId)
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       202:
 *         description: Job accepted
 *       400:
 *         description: Missing file
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/extract/start',
  ensureAuthenticated,
  upload.single('file'),
  startJobRateLimiter,
  asyncHandler((req, res) => controller.startExtractJob(req, res)),
);

/**
 * @swagger
 * /onboarding/extract/status/{jobId}:
 *   get:
 *     summary: Get extraction job status and progress
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Job not found
 */
router.get(
  '/extract/status/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getExtractJobStatus(req, res)),
);

/**
 * @swagger
 * /onboarding/extract/result/{jobId}:
 *   get:
 *     summary: Get extraction job result (only when completed)
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Extraction result
 *       400:
 *         description: Job not completed
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/extract/result/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getExtractJobResult(req, res)),
);

/**
 * @swagger
 * /onboarding/extract/{jobId}:
 *   delete:
 *     summary: Cancel and remove an extraction job
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job cancelled
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Job not found
 */
router.delete(
  '/extract/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.cancelExtractJob(req, res)),
);

/**
 * @swagger
 * /onboarding/bulk-create:
 *   post:
 *     summary: Bulk create fields and production units from extracted data
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
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: Company ID to associate fields with
 *               fields:
 *                 type: array
 *                 description: Field data from extract endpoint (possibly modified)
 *                 items:
 *                   type: object
 *                   required:
 *                     - foglio
 *                     - particella
 *                   properties:
 *                     name:
 *                       type: string
 *                     foglio:
 *                       type: string
 *                     particella:
 *                       type: string
 *                     sezione:
 *                       type: string
 *                     subalterno:
 *                       type: string
 *                     superficieCatastaleMq:
 *                       type: number
 *                     sauHa:
 *                       type: number
 *                     gisHa:
 *                       type: number
 *                     uso:
 *                       type: string
 *                     city:
 *                       type: string
 *                     region:
 *                       type: string
 *                     nation:
 *                       type: string
 *               productionUnits:
 *                 type: array
 *                 description: Production unit data from extract endpoint (possibly modified)
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     cropName:
 *                       type: string
 *                     cropType:
 *                       type: string
 *                     variety:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     areaHa:
 *                       type: number
 *                     fieldAllocations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fieldName:
 *                             type: string
 *                           foglio:
 *                             type: string
 *                           particella:
 *                             type: string
 *                           areaHa:
 *                             type: number
 *     responses:
 *       201:
 *         description: Fields and production units created successfully
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
 *                     fields:
 *                       type: array
 *                     productionUnits:
 *                       type: array
 *                     fieldCount:
 *                       type: number
 *                     productionUnitCount:
 *                       type: number
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
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
