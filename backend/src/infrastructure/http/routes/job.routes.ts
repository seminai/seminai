import { Router } from 'express';
import { PrismaJobRepository } from '../../repositories/PrismaJobRepository';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { JobController } from '../controllers/JobController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaProductRepository } from '../../repositories/PrismaProductRepository';
import { PrismaWarehouseRepository } from '../../repositories/PrismaWarehouseRepository';
import { prisma } from '../../repositories/Prisma';
import { createResourceAccessGuard } from '../access/create-resource-access-guard';

const router = Router();
const jobRepository = new PrismaJobRepository(prisma);
const stockRepository = new PrismaStockRepository(prisma);
const userRepository = new PrismaUserRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
const fieldRepository = new PrismaFieldRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const productRepository = new PrismaProductRepository(prisma);
const warehouseRepository = new PrismaWarehouseRepository(prisma);
const accessGuard = createResourceAccessGuard(prisma);
const controller = new JobController(
  jobRepository,
  stockRepository,
  accessGuard,
  userRepository,
  productionUnitRepository,
  fieldRepository,
  userOnCompanyRepository,
  productRepository,
  warehouseRepository,
);

/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: Job CRUD operations
 */

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new Job with optional attached stock movements
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Job created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.create(req, res)),
);

/**
 * @swagger
 * /jobs/create-product-and-job:
 *   post:
 *     summary: Bulk create Jobs and upsert related Products with Stocks
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       201:
 *         description: Jobs created with explicit job-product links
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
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     jobProductLinks:
 *                       type: array
 *                       description: Explicit mapping between each created job and linked products
 *                       items:
 *                         type: object
 *                         properties:
 *                           jobId:
 *                             type: string
 *                           stockCount:
 *                             type: integer
 *                           products:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 name:
 *                                   type: string
 *                                 registrationNumber:
 *                                   type: string
 *                                   nullable: true
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/create-product-and-job',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.bulkCreateProductAndJob(req, res)),
);

/**
 * @swagger
 * /jobs/create-product-and-job/status/{jobId}:
 *   get:
 *     summary: Get the status of an async product-job creation task
 *     tags: [Jobs]
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
 *       404:
 *         description: Job not found
 */
router.get(
  '/create-product-and-job/status/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getProductJobCreationStatus(req, res)),
);

/**
 * @swagger
 * /jobs/me:
 *   get:
 *     summary: List Jobs assigned to the authenticated user within their companies
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyName
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter jobs by company name (case-insensitive partial match)
 *     responses:
 *       200:
 *         description: List of jobs with related production units, fields, and company
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listForCurrentUser(req, res)),
);

/**
 * @swagger
 * /jobs/me/verified:
 *   get:
 *     summary: List verified and conformity checked Jobs (isVerified=true AND conformityChecked=true) assigned to the authenticated user within their companies
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyName
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter jobs by company name (case-insensitive partial match)
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (starts from 1)
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page (max 100)
 *     responses:
 *       200:
 *         description: List of verified and conformity checked jobs with related production units, fields, and company
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
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 45
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/me/verified',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listVerifiedForCurrentUser(req, res)),
);

/**
 * @swagger
 * /jobs/get-job-grouped-by-job-id:
 *   get:
 *     summary: Retrieve all jobs grouped by their jobId
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Jobs grouped by jobId
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/get-job-grouped-by-job-id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listGroupedByJobId(req, res)),
);

/**
 * @swagger
 * /jobs/groups-summary:
 *   get:
 *     summary: Get a summary of job groups with operation counts
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of job groups with summary data
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
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           jobId:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           company:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           totalOperations:
 *                             type: number
 *                           verifiedOperations:
 *                             type: number
 *                           pendingOperations:
 *                             type: number
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/groups-summary',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listJobGroupsSummary(req, res)),
);

/**
 * @swagger
 * /jobs/group/{jobId}:
 *   get:
 *     summary: Retrieve all jobs with the same jobId
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Filter jobs by jobId
 *     responses:
 *       200:
 *         description: List of jobs with the specified jobId
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/group/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByGroupJobId(req, res)),
);

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get Job by ID
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job found
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

/**
 * @swagger
 * /jobs/production-unit/{productionUnitId}:
 *   get:
 *     summary: List Jobs by Production Unit
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: productionUnitId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of jobs
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/production-unit/:productionUnitId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByProductionUnit(req, res)),
);

/**
 * @swagger
 * /jobs/bulk:
 *   put:
 *     summary: Bulk update multiple Jobs (all must belong to the same company)
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [updates]
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, data]
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Job ID to update
 *                     data:
 *                       type: object
 *                       description: Partial job fields to update
 *     responses:
 *       200:
 *         description: Jobs updated successfully
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
 *                     updatedCount:
 *                       type: integer
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Missing or invalid data, or jobs from different companies
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more jobs not found
 */
router.put(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.bulkUpdate(req, res)),
);

/**
 * @swagger
 * /jobs/{id}:
 *   put:
 *     summary: Update a Job and replace its attached stock movements (if provided)
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Job updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

/**
 * @swagger
 * /jobs/bulk:
 *   delete:
 *     summary: Bulk delete multiple Jobs and their attached stock movements
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobIds]
 *             properties:
 *               jobIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of Job IDs to delete
 *               force:
 *                 type: boolean
 *                 default: false
 *                 description: If true, force cancel active (running) jobs. If false, active jobs will not be cancelled.
 *     responses:
 *       200:
 *         description: Jobs deleted successfully
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
 *                     deletedCount:
 *                       type: number
 *                       example: 3
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: One or more jobs not found
 */
router.delete(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.bulkDelete(req, res)),
);

/**
 * @swagger
 * /jobs/{id}:
 *   delete:
 *     summary: Delete a Job and its attached stock movements
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

/**
 * @swagger
 * /jobs/{id}/assign-user:
 *   patch:
 *     summary: Assign an operator user to a Job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: User assigned to job
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User not in company
 *       404:
 *         description: Job or User not found
 */
router.patch(
  '/:id/assign-user',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.assignUser(req, res)),
);

export { router as jobRouter };
