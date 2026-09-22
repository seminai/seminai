import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { FieldController } from '../controllers/FieldController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { startJobRateLimiter } from '../middlewares/rateLimiter';
import { GetFieldsAvailabilityUseCase } from '../../../application/use-cases/field/GetFieldsAvailabilityUseCase';
import { DeleteFieldsBulkUseCase } from '../../../application/use-cases/field/DeleteFieldsBulkUseCase';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';

const router = Router();
const fieldRepository = new PrismaFieldRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
const getFieldsAvailabilityUseCase = new GetFieldsAvailabilityUseCase(
  fieldRepository,
  productionUnitRepository,
);
const deleteFieldsBulkUseCase = new DeleteFieldsBulkUseCase(fieldRepository);
const controller = new FieldController(
  fieldRepository,
  getFieldsAvailabilityUseCase,
  deleteFieldsBulkUseCase,
);

/**
 * @swagger
 * tags:
 *   name: Fields
 *   description: Field CRUD operations
 */

/**
 * @swagger
 * /fields/availability:
 *   get:
 *     summary: Get fields grouped by company with available area in date range
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startAt
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for availability check (default is current date)
 *       - in: query
 *         name: endAt
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for availability check (default is one year from now)
 *     responses:
 *       200:
 *         description: List of companies with fields that have available area (full field payload included)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     companies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           fields:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 name:
 *                                   type: string
 *                                 sauHa:
 *                                   type: number
 *                                 areaOccupied:
 *                                   type: number
 *                                 areaAvailable:
 *                                   type: number
 *                                 coordinates:
 *                                   type: array
 *                                   items:
 *                                     type: number
 *                                 latitude:
 *                                   type: number
 *                                   nullable: true
 *                                 longitude:
 *                                   type: number
 *                                   nullable: true
 *                                 polygon:
 *                                   type: object
 *                                   nullable: true
 *                                 gisHa:
 *                                   type: number
 *                                   nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/availability',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listAvailabilityByCompanies(req, res)),
);

/**
 * @swagger
 * /fields/start-job-field-extraction:
 *   post:
 *     summary: Start a job to extract fields from Excel file
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               companyId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Job completed successfully with extracted fields (ready for bulk create)
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
 *                         required:
 *                           - companyId
 *                           - name
 *                           - address
 *                           - sezione
 *                           - foglio
 *                           - particella
 *                           - superficieCatastaleMq
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           latitude:
 *                             type: number
 *                             nullable: true
 *                           longitude:
 *                             type: number
 *                             nullable: true
 *                           polygon:
 *                             type: object
 *                             nullable: true
 *                           gisHa:
 *                             type: number
 *                             nullable: true
 *                           sauHa:
 *                             type: number
 *                             nullable: true
 *                           ph:
 *                             type: number
 *                             nullable: true
 *                           nitrogen:
 *                             type: number
 *                             nullable: true
 *                           phosphorus:
 *                             type: number
 *                             nullable: true
 *                           potassium:
 *                             type: number
 *                             nullable: true
 *                           calcium:
 *                             type: number
 *                             nullable: true
 *                           magnesium:
 *                             type: number
 *                             nullable: true
 *                           soilType:
 *                             type: string
 *                             nullable: true
 *                           uso:
 *                             type: string
 *                             nullable: true
 *                           qualita:
 *                             type: string
 *                             nullable: true
 *                           superficieCatastaleMq:
 *                             type: number
 *                             nullable: true
 *                           sezione:
 *                             type: string
 *                             nullable: true
 *                           foglio:
 *                             type: string
 *                             nullable: true
 *                           particella:
 *                             type: string
 *                             nullable: true
 *                           subalterno:
 *                             type: string
 *                             nullable: true
 *                           nation:
 *                             type: string
 *                             nullable: true
 *                           region:
 *                             type: string
 *                             nullable: true
 *                           city:
 *                             type: string
 *                             nullable: true
 *                           address:
 *                             type: string
 *                           cap:
 *                             type: string
 *                             nullable: true
 *                           variazioneMq:
 *                             type: string
 *                             nullable: true
 *                           inizioConduzione:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                           fineConduzione:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                     extractedCount:
 *                       type: number
 *       202:
 *         description: Job started but not finished yet (polling needed)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: accepted
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *       400:
 *         description: Missing file or companyId
 *       401:
 *         description: Unauthorized
 *       422:
 *         description: Job failed
 */
// Rate limit: 10 richieste/minuto per utente
router.post(
  '/start-job-field-extraction',
  ensureAuthenticated,
  startJobRateLimiter,
  upload.single('file'),
  asyncHandler((req, res) => controller.startExtractionJob(req, res)),
);

router.get(
  '/extraction-status/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getExtractionJobStatus(req, res)),
);

/**
 * @swagger
 * /fields/extract:
 *   post:
 *     summary: Extract fields from Excel file without saving to database
 *     tags: [Fields]
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
 *               - companyId
 *               - file
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: Company id to attach extracted fields
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Fields extracted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - companyId
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           city:
 *                             type: string
 *                           foglio:
 *                             type: string
 *                           particella:
 *                             type: string
 *                           superficieCatastaleMq:
 *                             type: number
 *                           gisHa:
 *                             type: number
 *                           sauHa:
 *                             type: number
 *                           uso:
 *                             type: string
 *                           sezione:
 *                             type: string
 *                           inizioConduzione:
 *                             type: string
 *                             format: date
 *                           fineConduzione:
 *                             type: string
 *                             format: date
 *                           address:
 *                             type: string
 *                           qualita:
 *                             type: string
 *                           soilType:
 *                             type: string
 *                           ph:
 *                             type: number
 *                           nitrogen:
 *                             type: number
 *                           phosphorus:
 *                             type: number
 *                           potassium:
 *                             type: number
 *                           calcium:
 *                             type: number
 *                           magnesium:
 *                             type: number
 *                           subalterno:
 *                             type: string
 *                           nation:
 *                             type: string
 *                           region:
 *                             type: string
 *                           cap:
 *                             type: string
 *                           variazioneMq:
 *                             type: string
 *                     extractedCount:
 *                       type: number
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/extract',
  ensureAuthenticated,
  upload.any(),
  asyncHandler((req, res) => controller.extractOnly(req, res)),
);

/**
 * @swagger
 * /fields:
 *   get:
 *     summary: List fields across all companies for current user
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of fields with full payload (coordinates, polygon, cadastral and agronomic data) and productionUnits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           latitude:
 *                             type: number
 *                             nullable: true
 *                           longitude:
 *                             type: number
 *                             nullable: true
 *                           polygon:
 *                             type: object
 *                             nullable: true
 *                           coordinatesGaussBoaga:
 *                             type: array
 *                             items:
 *                               type: number
 *                           polygonGaussBoaga:
 *                             type: object
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listForCurrentUser(req, res)),
);

/**
 * @swagger
 * /fields:
 *   post:
 *     summary: Create a new Field
 *     tags: [Fields]
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
 *               - name
 *               - address
 *               - sezione
 *               - foglio
 *               - particella
 *               - superficieCatastaleMq
 *             properties:
 *               companyId:
 *                 type: string
 *               name:
 *                 type: string
 *               coordinates:
 *                 type: array
 *                 items:
 *                   type: number
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               polygon:
 *                 type: object
 *               gisHa:
 *                 type: number
 *               sauHa:
 *                 type: number
 *               ph:
 *                 type: number
 *               nitrogen:
 *                 type: number
 *               phosphorus:
 *                 type: number
 *               potassium:
 *                 type: number
 *               calcium:
 *                 type: number
 *               magnesium:
 *                 type: number
 *               soilType:
 *                 type: string
 *               uso:
 *                 type: string
 *               qualita:
 *                 type: string
 *               superficieCatastaleMq:
 *                 type: number
 *               sezione:
 *                 type: string
 *               foglio:
 *                 type: string
 *               particella:
 *                 type: string
 *               subalterno:
 *                 type: string
 *               nation:
 *                 type: string
 *               region:
 *                 type: string
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               cap:
 *                 type: string
 *               variazioneMq:
 *                 type: string
 *               inizioConduzione:
 *                 type: string
 *                 format: date-time
 *               fineConduzione:
 *                 type: string
 *                 format: date-time
 *               bufferZoneNotes:
 *                 type: string
 *                 description: Note sulle fasce di rispetto e deriva (testo lungo)
 *     responses:
 *       201:
 *         description: Field created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.create(req, res)),
);

/**
 * @swagger
 * /fields/bulk:
 *   post:
 *     summary: Create multiple Fields (can belong to different companies)
 *     tags: [Fields]
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
 *               - fields
 *             properties:
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyId
 *                     - name
 *                     - address
 *                     - sezione
 *                     - foglio
 *                     - particella
 *                     - superficieCatastaleMq
 *                   properties:
 *                     companyId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     address:
 *                       type: string
 *                     sezione:
 *                       type: string
 *                     foglio:
 *                       type: string
 *                     particella:
 *                       type: string
 *                     superficieCatastaleMq:
 *                       type: number
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     coordinates:
 *                       type: array
 *                       items:
 *                         type: number
 *                     polygon:
 *                       type: object
 *                     gisHa:
 *                       type: number
 *                     sauHa:
 *                       type: number
 *                     inizioConduzione:
 *                       type: string
 *                       format: date
 *                     fineConduzione:
 *                       type: string
 *                       format: date
 *     responses:
 *       201:
 *         description: Fields created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.createBulk(req, res)),
);

/**
 * @swagger
 * /fields/{id}:
 *   get:
 *     summary: Get Field by ID (includes linked Production Units)
 *     tags: [Fields]
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
 *         description: Field found with full payload (coordinates, polygon, cadastral and agronomic data) and productionUnits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     field:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         coordinates:
 *                           type: array
 *                           items:
 *                             type: number
 *                         latitude:
 *                           type: number
 *                           nullable: true
 *                         longitude:
 *                           type: number
 *                           nullable: true
 *                         polygon:
 *                           type: object
 *                           nullable: true
 *                         coordinatesGaussBoaga:
 *                           type: array
 *                           items:
 *                             type: number
 *                         polygonGaussBoaga:
 *                           type: object
 *                           nullable: true
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
 * /fields/company/{companyId}:
 *   get:
 *     summary: List fields by company (includes linked Production Units)
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of fields with full payload (coordinates, polygon, cadastral and agronomic data) and productionUnits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           latitude:
 *                             type: number
 *                             nullable: true
 *                           longitude:
 *                             type: number
 *                             nullable: true
 *                           polygon:
 *                             type: object
 *                             nullable: true
 *                           coordinatesGaussBoaga:
 *                             type: array
 *                             items:
 *                               type: number
 *                           polygonGaussBoaga:
 *                             type: object
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/company/:companyId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  asyncHandler((req, res) => controller.listByCompany(req, res)),
);

/**
 * @swagger
 * /fields/bulk:
 *   put:
 *     summary: Update multiple Fields in bulk
 *     tags: [Fields]
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
 *               - fields
 *             properties:
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     coordinates:
 *                       type: array
 *                       items:
 *                         type: number
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     polygon:
 *                       type: object
 *                     gisHa:
 *                       type: number
 *                     sauHa:
 *                       type: number
 *                     ph:
 *                       type: number
 *                     nitrogen:
 *                       type: number
 *                     phosphorus:
 *                       type: number
 *                     potassium:
 *                       type: number
 *                     calcium:
 *                       type: number
 *                     magnesium:
 *                       type: number
 *                     soilType:
 *                       type: string
 *                     uso:
 *                       type: string
 *                     qualita:
 *                       type: string
 *                     superficieCatastaleMq:
 *                       type: number
 *                     sezione:
 *                       type: string
 *                     foglio:
 *                       type: string
 *                     particella:
 *                       type: string
 *                     subalterno:
 *                       type: string
 *                     nation:
 *                       type: string
 *                     region:
 *                       type: string
 *                     city:
 *                       type: string
 *                     address:
 *                       type: string
 *                     cap:
 *                       type: string
 *                     variazioneMq:
 *                       type: string
 *                     inizioConduzione:
 *                       type: string
 *                       format: date-time
 *                     fineConduzione:
 *                       type: string
 *                       format: date-time
 *                     bufferZoneNotes:
 *                       type: string
 *                       description: Note sulle fasce di rispetto e deriva (testo lungo)
 *     responses:
 *       200:
 *         description: Fields updated successfully
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.put(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.updateBulk(req, res)),
);

/**
 * @swagger
 * /fields/bulk:
 *   delete:
 *     summary: Delete multiple Fields in bulk
 *     tags: [Fields]
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
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of Field IDs to delete
 *     responses:
 *       204:
 *         description: Fields deleted successfully
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.delete(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.deleteBulk(req, res)),
);

/**
 * @swagger
 * /fields/{id}:
 *   put:
 *     summary: Update a Field
 *     tags: [Fields]
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
 *         description: Field updated
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
 * /fields/{id}:
 *   delete:
 *     summary: Delete a Field
 *     tags: [Fields]
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

export { router as fieldRouter };
