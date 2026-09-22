import { Router } from 'express';
import { FileController } from '../controllers/FileController';
import { PrismaFileRepository } from '../../repositories/PrismaFileRepository';
import { PrismaArchiveDeletionRepository } from '../../repositories/PrismaArchiveDeletionRepository';
import { DeleteFilesBulkUseCase } from '../../../application/use-cases/file/DeleteFilesBulkUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { CompanyRole } from '@prisma/client';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';
import { createResourceAccessGuard } from '../access/create-resource-access-guard';

const fileRouter = Router();
const fileRepository = new PrismaFileRepository(prisma);
const deleteFilesBulkUseCase = new DeleteFilesBulkUseCase(
  fileRepository,
  new PrismaArchiveDeletionRepository(prisma),
);
const controller = new FileController(
  fileRepository,
  deleteFilesBulkUseCase,
  createResourceAccessGuard(prisma),
);

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: Generic file management
 */

/**
 * @swagger
 * /files/upload:
 *   post:
 *     summary: Upload a file to a specific path and link it to a company
 *     tags: [Files]
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
 *               - path
 *               - companyId
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               companyId:
 *                 type: string
 *                 description: The ID of the company associated with this file
 *               path:
 *                 type: string
 *                 description: The subdirectory path where the file should be stored (e.g., "profile/images")
 *               type:
 *                 type: string
 *                 description: Optional file type metadata
 *     responses:
 *       200:
 *         description: File uploaded successfully
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
 *                     file:
 *                       type: object
 *       400:
 *         description: Missing file, path, or companyId
 *       401:
 *         description: Unauthorized
 */
fileRouter.post(
  '/upload',
  ensureAuthenticated,
  upload.single('file'),
  // Middleware order swapped:
  // Multer MUST process the multipart/form-data first to populate req.body with text fields (like companyId)
  // Before that, req.body is empty for multipart requests, so ensureCompanyRole fails to find companyId
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  asyncHandler((req, res) => controller.upload(req, res)),
);

/**
 * @swagger
 * /files:
 *   get:
 *     summary: List files for a company
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of files
 *       400:
 *         description: Missing companyId
 *       401:
 *         description: Unauthorized
 */
fileRouter.get(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  asyncHandler((req, res) => controller.list(req, res)),
);

/**
 * @swagger
 * /files/bulk:
 *   delete:
 *     summary: Delete multiple files by IDs
 *     tags: [Files]
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
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               extractionIds:
 *                 type: array
 *                 description: FileExtraction ids to remove (used when archive rows have no underlying File yet, e.g. PDFs in PENDING_CONFIRMATION)
 *                 items:
 *                   type: string
 *               companyId:
 *                 type: string
 *               cascade:
 *                 type: object
 *                 description: Optional cascade flags triggered by deleting system-generated files
 *                 properties:
 *                   fields:
 *                     type: boolean
 *                     description: When true, deletes every Field of the company (used for "Campi" system file)
 *                   productionUnits:
 *                     type: boolean
 *                     description: When true, deletes every ProductionUnit of the company (used for "Unità Produttive" system file)
 *                   stocksAll:
 *                     type: boolean
 *                     description: When true, deletes every Stock of the company (used for "Magazzino" system file)
 *                   productsAll:
 *                     type: boolean
 *                     description: When true, deletes every Product and related Stock of the company while keeping Warehouse records
 *                   fieldNotes:
 *                     type: boolean
 *                     description: When true, deletes every FieldNote of the company (used for "Note di Campo" system file)
 *     responses:
 *       200:
 *         description: Files deleted successfully
 *       400:
 *         description: Missing or invalid ids
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: A file does not belong to the given company
 */
fileRouter.delete(
  '/bulk',
  ensureAuthenticated,
  // Check permissions for company (requires companyId in body)
  // Deletion usually requires ADMIN or EDITOR role
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.deleteBulk(req, res)),
);

/**
 * @swagger
 * /files/{id}:
 *   get:
 *     summary: Get file details by ID
 *     tags: [Files]
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
 *         description: File details
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
fileRouter.get(
  '/expiring',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  asyncHandler((req, res) => controller.listExpiring(req, res)),
);

fileRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getById(req, res)),
);

fileRouter.patch(
  '/:id/expiry',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.updateExpiry(req, res)),
);

/**
 * @swagger
 * /files/{id}:
 *   put:
 *     summary: Update file metadata
 *     tags: [Files]
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
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: File updated
 *       404:
 *         description: File not found
 *       401:
 *         description: Unauthorized
 */
fileRouter.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

export { fileRouter };
