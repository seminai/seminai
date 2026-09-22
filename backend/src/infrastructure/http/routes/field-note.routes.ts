import { Router } from 'express';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { FieldNoteController } from '../controllers/FieldNoteController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { GetFieldNoteByIdUseCase } from '../../../application/use-cases/field-note/GetFieldNoteByIdUseCase';
import { ListFieldNotesByUserUseCase } from '../../../application/use-cases/field-note/ListFieldNotesByUserUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { DeleteFieldNoteUseCase } from '../../../application/use-cases/field-note/DeleteFieldNoteUseCase';
import { AddFieldNoteAttachmentUseCase } from '../../../application/use-cases/field-note/AddFieldNoteAttachmentUseCase';
import { GetFieldNoteStatsUseCase } from '../../../application/use-cases/field-note/GetFieldNoteStatsUseCase';
import { upload } from '../../services/Multer';

const router = Router();
const fieldNoteRepository = new PrismaFieldNoteRepository(prisma);

const createFieldNoteUseCase = new CreateFieldNoteUseCase(fieldNoteRepository);
const getFieldNoteByIdUseCase = new GetFieldNoteByIdUseCase(fieldNoteRepository);
const listFieldNotesByUserUseCase = new ListFieldNotesByUserUseCase(fieldNoteRepository);
const updateFieldNoteUseCase = new UpdateFieldNoteUseCase(fieldNoteRepository);
const deleteFieldNoteUseCase = new DeleteFieldNoteUseCase(fieldNoteRepository);
const addFieldNoteAttachmentUseCase = new AddFieldNoteAttachmentUseCase(fieldNoteRepository);
const getFieldNoteStatsUseCase = new GetFieldNoteStatsUseCase(fieldNoteRepository);

const controller = new FieldNoteController(
  createFieldNoteUseCase,
  getFieldNoteByIdUseCase,
  listFieldNotesByUserUseCase,
  updateFieldNoteUseCase,
  deleteFieldNoteUseCase,
  addFieldNoteAttachmentUseCase,
  getFieldNoteStatsUseCase,
);

/**
 * @swagger
 * tags:
 *   name: Field Notes
 *   description: Field note operations
 */

/**
 * @swagger
 * /field-notes:
 *   post:
 *     summary: Create a new field note
 *     tags: [Field Notes]
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
 *               - category
 *               - rawContent
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [OPERATION, OBSERVATION, MEASUREMENT, HARVEST, MAINTENANCE, OTHER]
 *               rawContent:
 *                 type: string
 *                 description: Free text from the user
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               altitude:
 *                 type: number
 *               gpsAccuracy:
 *                 type: number
 *               operationDate:
 *                 type: string
 *                 format: date-time
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Field note created successfully
 *       400:
 *         description: Missing required fields
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
 * /field-notes:
 *   get:
 *     summary: List field notes for current user
 *     tags: [Field Notes]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [OPERATION, OBSERVATION, MEASUREMENT, HARVEST, MAINTENANCE, OTHER]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, PROCESSED, FAILED, MANUALLY_REVIEWED]
 *       - in: query
 *         name: fieldId
 *         schema:
 *           type: string
 *       - in: query
 *         name: productionUnitId
 *         schema:
 *           type: string
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: hasLocation
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of field notes
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

/**
 * @swagger
 * /field-notes/stats:
 *   get:
 *     summary: Get field notes statistics for current user
 *     tags: [Field Notes]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Field notes statistics
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
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalNotes:
 *                           type: number
 *                         byStatus:
 *                           type: object
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/stats',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getStats(req, res)),
);

/**
 * @swagger
 * /field-notes/{id}:
 *   get:
 *     summary: Get field note by ID
 *     tags: [Field Notes]
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
 *         description: Field note found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getById(req, res)),
);

/**
 * @swagger
 * /field-notes/{id}:
 *   put:
 *     summary: Update a field note
 *     tags: [Field Notes]
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
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [OPERATION, OBSERVATION, MEASUREMENT, HARVEST, MAINTENANCE, OTHER]
 *               rawContent:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [PENDING, PROCESSING, PROCESSED, FAILED, MANUALLY_REVIEWED]
 *               fieldId:
 *                 type: string
 *               productionUnitId:
 *                 type: string
 *               productId:
 *                 type: string
 *               notes:
 *                 type: string
 *               extractedData:
 *                 type: object
 *               aiConfidenceScore:
 *                 type: number
 *     responses:
 *       200:
 *         description: Field note updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
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
 * /field-notes/{id}:
 *   delete:
 *     summary: Delete a field note
 *     tags: [Field Notes]
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
 *         description: Field note deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
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
 * /field-notes/attachments:
 *   post:
 *     summary: Add an attachment to a field note
 *     tags: [Field Notes]
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
 *               - fieldNoteId
 *               - fileUrl
 *               - fileName
 *               - fileType
 *               - fileSize
 *             properties:
 *               fieldNoteId:
 *                 type: string
 *               fileUrl:
 *                 type: string
 *               fileName:
 *                 type: string
 *               fileType:
 *                 type: string
 *               fileSize:
 *                 type: number
 *               thumbnailUrl:
 *                 type: string
 *               metadata:
 *                 type: object
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - fieldNoteId
 *               - file
 *             properties:
 *               fieldNoteId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *               fileName:
 *                 type: string
 *               fileType:
 *                 type: string
 *               fileSize:
 *                 type: number
 *               thumbnailUrl:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Attachment added successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  '/attachments',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => controller.addAttachment(req, res)),
);

export { router as fieldNoteRouter };
