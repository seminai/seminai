import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { ProductionUnitController } from '../controllers/ProductionUnitController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { CreateProductionUnitUseCase } from '../../../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { CreateProductionUnitsBulkUseCase } from '../../../application/use-cases/production-unit/CreateProductionUnitsBulkUseCase';
import { UpdateProductionUnitUseCase } from '../../../application/use-cases/production-unit/UpdateProductionUnitUseCase';
import { DeleteProductionUnitUseCase } from '../../../application/use-cases/production-unit/DeleteProductionUnitUseCase';
import { DeleteProductionUnitsBulkUseCase } from '../../../application/use-cases/production-unit/DeleteProductionUnitsBulkUseCase';
import { ListProductionUnitsByUserUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByUserUseCase';
import { ListProductionUnitsByCropUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByCropUseCase';
import { ListProductionUnitsByCompaniesUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByCompaniesUseCase';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { BulkImportController } from '../controllers/BulkImportController';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../../../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';
import { createResourceAccessGuard } from '../access/create-resource-access-guard';

const router = Router();
const repository = new PrismaProductionUnitRepository(prisma);
const fieldRepository = new PrismaFieldRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const createUseCase = new CreateProductionUnitUseCase(repository, fieldRepository);
const createBulkUseCase = new CreateProductionUnitsBulkUseCase(repository, fieldRepository);
const updateUseCase = new UpdateProductionUnitUseCase(repository, fieldRepository);
const deleteUseCase = new DeleteProductionUnitUseCase(repository);
const deleteBulkUseCase = new DeleteProductionUnitsBulkUseCase(repository);
const listByUserUseCase = new ListProductionUnitsByUserUseCase(repository);
const listByCropUseCase = new ListProductionUnitsByCropUseCase(repository);
const listByCompaniesUseCase = new ListProductionUnitsByCompaniesUseCase(
  repository,
  userOnCompanyRepository,
);
const bulkImportUseCase = new BulkImportFieldsAndProductionUnitsUseCase(
  fieldRepository,
  repository,
  companyRepository,
);
const controller = new ProductionUnitController(
  repository,
  fieldRepository,
  createUseCase,
  createBulkUseCase,
  updateUseCase,
  deleteUseCase,
  deleteBulkUseCase,
  listByUserUseCase,
  listByCropUseCase,
  listByCompaniesUseCase,
  createResourceAccessGuard(prisma),
);
const bulkImportController = new BulkImportController(bulkImportUseCase);

/**
 * @swagger
 * tags:
 *   name: ProductionUnits
 *   description: ProductionUnits management
 */

/**
 * @swagger
 * /production-units/extract:
 *   post:
 *     summary: Extract production units from file (CSV, Excel, or PDF) without saving
 *     tags: [ProductionUnits]
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
 *                 description: Company id used to match fields by cadastral references
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Production units extracted successfully
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
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           companyId: { type: string }
 *                           name: { type: string }
 *                           cropName: { type: string, nullable: true }
 *                           cropType: { type: string, nullable: true }
 *                           variety: { type: string, nullable: true }
 *                           protocoll: { type: string, nullable: true }
 *                           protectionStructure: { type: string, nullable: true }
 *                           allocations:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 fieldId: { type: string, nullable: true }
 *                                 areaHa: { type: number, nullable: true }
 *                           areaHa: { type: number, nullable: true }
 *                           fieldId: { type: string, nullable: true }
 *                           matchedFieldName: { type: string, nullable: true }
 *                           matchedCropCode: { type: string, nullable: true }
 *                           startDate: { type: string, format: date, nullable: true }
 *                           floweringDate: { type: string, format: date, nullable: true }
 *                           harvestingDate: { type: string, format: date, nullable: true }
 *                           endDate: { type: string, format: date, nullable: true }
 *                     extractedCount:
 *                       type: number
 *       400:
 *         description: Missing file or companyId
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/extract',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  upload.single('file'),
  asyncHandler((req, res) => controller.extractFromFile(req, res)),
);

/**
 * @swagger
 * /production-units:
 *   get:
 *     summary: List all Production Units accessible to the authenticated user
 *     tags: [ProductionUnits]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of ProductionUnits with company and field details
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
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productionUnit:
 *                             type: object
 *                           companyId:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           crop:
 *                             type: object
 *                             properties:
 *                               name: { type: string }
 *                               type: { type: string }
 *                               variety: { type: string }
 *                           fields:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: string }
 *                                 name: { type: string }
 *                                 sauHa: { type: number, nullable: true }
 *                                 gisHa: { type: number, nullable: true }
 *                                 areaHaOnField: { type: number }
 *   post:
 *     summary: Create a new Production Unit
 *     tags: [ProductionUnits]
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
 *               - name
 *               - cropName
 *               - cropType
 *               - variety
 *               - protocoll
 *               - allocations
 *               - protectionStructure
 *               - startDate
 *               - floweringDate
 *               - harvestingDate
 *               - endDate
 *               - acquaTotalePeridoL
 *             properties:
 *               name: { type: string }
 *               cropName: { type: string }
 *               cropType: { type: string }
 *               variety: { type: string }
 *               protocoll: { type: string }
 *               areaHa: { type: number, description: "If omitted, derived from allocations" }
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [fieldId, areaHa]
 *                   properties:
 *                     fieldId: { type: string }
 *                     areaHa: { type: number }
 *               protectionStructure: { type: string }
 *               startDate: { type: string, format: date-time }
 *               floweringDate: { type: string, format: date-time }
 *               harvestingDate: { type: string, format: date-time }
 *               endDate: { type: string, format: date-time }
 *               occupazione: { type: string }
 *               destinazioneDiUso: { type: string }
 *               acquaTotalePeridoL: { type: number }
 *     responses:
 *       201:
 *         description: ProductionUnit created
 *       400:
 *         description: Validation error (area/range)
 */
router.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByUser(req, res)),
);

/**
 * @swagger
 * /production-units/get-production-unit-by-crop:
 *   get:
 *     summary: Get production units by crop name for all companies where user is assigned
 *     tags: [ProductionUnits]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: cropName
 *         required: true
 *         schema:
 *           type: string
 *         description: Crop name to filter production units
 *     responses:
 *       200:
 *         description: List of ProductionUnits with the specified crop, including company and field details
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
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productionUnit:
 *                             type: object
 *                           companyId:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           crop:
 *                             type: object
 *                             properties:
 *                               name: { type: string }
 *                               type: { type: string }
 *                               variety: { type: string }
 *                           fields:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: string }
 *                                 name: { type: string }
 *                                 sauHa: { type: number, nullable: true }
 *                                 gisHa: { type: number, nullable: true }
 *                                 areaHaOnField: { type: number }
 *       400:
 *         description: Missing or invalid cropName parameter
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/get-production-unit-by-crop',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByCrop(req, res)),
);

/**
 * @swagger
 * /production-units/get-production-unit-by-companies:
 *   post:
 *     summary: Get production units by multiple company IDs
 *     description: Returns production units for the specified companies. Verifies that the user has access to all specified companies.
 *     tags: [ProductionUnits]
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
 *               - companyIds
 *             properties:
 *               companyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of company IDs to filter production units
 *                 example: ["company-id-1", "company-id-2"]
 *     responses:
 *       200:
 *         description: List of ProductionUnits for the specified companies, including company and field details
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
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productionUnit:
 *                             type: object
 *                           companyId:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           crop:
 *                             type: object
 *                             properties:
 *                               name: { type: string }
 *                               type: { type: string }
 *                               variety: { type: string }
 *                           fields:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id: { type: string }
 *                                 name: { type: string }
 *                                 sauHa: { type: number, nullable: true }
 *                                 gisHa: { type: number, nullable: true }
 *                                 areaHaOnField: { type: number }
 *       400:
 *         description: Missing or invalid companyIds parameter
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: User does not have access to one or more of the specified companies
 */
router.post(
  '/get-production-unit-by-companies',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByCompanies(req, res)),
);

router.post(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'fieldId'),
  asyncHandler((req, res) => controller.create(req, res)),
);

/**
 * @swagger
 * /production-units/bulk/create:
 *   post:
 *     summary: Create multiple Production Units in bulk
 *     tags: [ProductionUnits]
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
 *                     - name
 *                     - cropName
 *                     - cropType
 *                     - variety
 *                     - protocoll
 *                     - allocations
 *                     - protectionStructure
 *                     - startDate
 *                     - floweringDate
 *                     - harvestingDate
 *                     - endDate
 *                   properties:
 *                     name: { type: string }
 *                     cropName: { type: string }
 *                     cropType: { type: string }
 *                     variety: { type: string }
 *                     protocoll: { type: string }
 *                     areaHa: { type: number, description: "If omitted, derived from allocations" }
 *                     allocations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required: [fieldId, areaHa]
 *                         properties:
 *                           fieldId: { type: string }
 *                           areaHa: { type: number }
 *                     protectionStructure: { type: string }
 *                     startDate: { type: string, format: date-time }
 *                     floweringDate: { type: string, format: date-time }
 *                     harvestingDate: { type: string, format: date-time }
 *                     endDate: { type: string, format: date-time }
 *                     occupazione: { type: string, nullable: true }
 *                     destinazioneDiUso: { type: string, nullable: true }
 *                     acquaTotalePeridoL: { type: number, nullable: true, description: "Default: 0 if not provided" }
 *     responses:
 *       201:
 *         description: Production Units created successfully
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
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                     count:
 *                       type: number
 *                       description: Number of Production Units created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/bulk/create',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.createBulk(req, res)),
);

/**
 * @swagger
 * /production-units/bulk:
 *   put:
 *     summary: Update multiple Production Units in bulk
 *     tags: [ProductionUnits]
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
 *                     - id
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     cropName:
 *                       type: string
 *                     cropType:
 *                       type: string
 *                     variety:
 *                       type: string
 *                     protocoll:
 *                       type: string
 *                     areaHa:
 *                       type: number
 *                     protectionStructure:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     floweringDate:
 *                       type: string
 *                       format: date-time
 *                     harvestingDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                     occupazione:
 *                       type: string
 *                       nullable: true
 *                     destinazioneDiUso:
 *                       type: string
 *                       nullable: true
 *                     acquaTotalePeridoL:
 *                       type: number
 *     responses:
 *       200:
 *         description: Production Units updated successfully
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
 *                     count:
 *                       type: number
 *                       description: Number of Production Units updated
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
 * /production-units/bulk:
 *   delete:
 *     summary: Delete multiple Production Units in bulk
 *     tags: [ProductionUnits]
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
 *                 description: Array of Production Unit IDs to delete
 *     responses:
 *       204:
 *         description: Production Units deleted successfully
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
 * /production-units/{id}:
 *   put:
 *     summary: Update a Production Unit
 *     tags: [ProductionUnits]
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
 *               name: { type: string }
 *               cropName: { type: string }
 *               cropType: { type: string }
 *               variety: { type: string }
 *               protocoll: { type: string }
 *               areaHa: { type: number }
 *               protectionStructure: { type: string }
 *               startDate: { type: string, format: date-time }
 *               floweringDate: { type: string, format: date-time, nullable: true }
 *               harvestingDate: { type: string, format: date-time, nullable: true }
 *               endDate: { type: string, format: date-time }
 *               occupazione: { type: string, nullable: true }
 *               destinazioneDiUso: { type: string, nullable: true }
 *               acquaTotalePeridoL: { type: number }
 *               seasonYear: { type: number }
 *               cycleIndex: { type: number }
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [fieldId, areaHa]
 *                   properties:
 *                     fieldId: { type: string }
 *                     areaHa: { type: number }
 *     responses:
 *       200:
 *         description: ProductionUnit updated
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
 *                     productionUnit:
 *                       type: object
 *       400:
 *         description: Validation error (area/range)
 */
router.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

/**
 * @swagger
 * /production-units/{id}:
 *   get:
 *     summary: Get Production Unit by id with assigned field ids
 *     tags: [ProductionUnits]
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
 *         description: ProductionUnit with fieldIds
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
 * /production-units/{id}:
 *   delete:
 *     summary: Delete a Production Unit
 *     tags: [ProductionUnits]
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
 */
router.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

/**
 * @swagger
 * /production-units/field/{fieldId}:
 *   get:
 *     summary: List Production Units by field
 *     tags: [ProductionUnits]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: fieldId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of ProductionUnits
 */
router.get(
  '/field/:fieldId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'fieldId'),
  asyncHandler((req, res) => controller.listByField(req, res)),
);

/**
 * @swagger
 * /production-units/bulk-import:
 *   post:
 *     summary: Bulk import fields and production units with upsert logic using cadastral references
 *     tags: [ProductionUnits]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *                 description: Company name (optional, overrides field company settings)
 *               vatNumber:
 *                 type: string
 *                 description: Company VAT number (optional, overrides field company settings)
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     companyName:
 *                       type: string
 *                       description: Company name for this field
 *                     vatNumber:
 *                       type: string
 *                       description: Company VAT number for this field
 *                     name:
 *                       type: string
 *                       description: Field name
 *                     coordinates:
 *                       type: array
 *                       items:
 *                         type: number
 *                       description: Geographic coordinates [longitude, latitude]
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     gisHa:
 *                       type: number
 *                     sauHa:
 *                       type: number
 *                     superficieCatastaleMq:
 *                       type: number
 *                     sezione:
 *                       type: string
 *                       description: Cadastral section
 *                     foglio:
 *                       type: string
 *                       description: Cadastral sheet
 *                     particella:
 *                       type: string
 *                       description: Cadastral parcel
 *                     subalterno:
 *                       type: string
 *                       description: Cadastral subaltern (optional)
 *                     address:
 *                       type: string
 *               productionUnits:
 *                 type: array
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
 *                     protocoll:
 *                       type: string
 *                     protectionStructure:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     floweringDate:
 *                       type: string
 *                       format: date
 *                     harvestingDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     acquaTotalePeridoL:
 *                       type: number
 *                     fieldAllocations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fieldName:
 *                             type: string
 *                             description: Field name
 *                           sezione:
 *                             type: string
 *                             description: Cadastral section
 *                           foglio:
 *                             type: string
 *                             description: Cadastral sheet
 *                           particella:
 *                             type: string
 *                             description: Cadastral parcel
 *                           subalterno:
 *                             type: string
 *                             description: Cadastral subaltern (optional)
 *                           areaHa:
 *                             type: number
 *     responses:
 *       201:
 *         description: Fields and production units imported successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/bulk-import',
  ensureAuthenticated,
  asyncHandler((req, res) => bulkImportController.bulkImportFieldsAndProductionUnits(req, res)),
);

export { router as productionUnitRouter };
