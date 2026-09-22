import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaWarehouseRepository } from '../../repositories/PrismaWarehouseRepository';
import { WarehouseController } from '../controllers/WarehouseController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { prisma } from '../../repositories/Prisma';
import { createResourceAccessGuard } from '../access/create-resource-access-guard';

const router = Router();
const warehouseRepository = new PrismaWarehouseRepository(prisma);
const controller = new WarehouseController(warehouseRepository, createResourceAccessGuard(prisma));

/**
 * @swagger
 * tags:
 *   name: Warehouses
 *   description: Warehouse CRUD operations
 */
/**
 * @swagger
 * /warehouses:
 *   post:
 *     summary: Create a new Warehouse
 *     tags: [Warehouses]
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
 *             properties:
 *               companyId:
 *                 type: string
 *               name:
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
 *               sezione:
 *                 type: string
 *               foglio:
 *                 type: string
 *               particella:
 *                 type: string
 *               subalterno:
 *                 type: string
 *             description: Only companyId and name are required; other fields are optional and default to empty string when omitted.
 *     responses:
 *       201:
 *         description: Warehouse created
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
 * /warehouses/{id}:
 *   get:
 *     summary: Get Warehouse by ID
 *     tags: [Warehouses]
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
 *         description: Warehouse found
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
 * /warehouses/company/{companyId}:
 *   get:
 *     summary: List warehouses by company
 *     tags: [Warehouses]
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
 *         description: List of warehouses
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
 * /warehouses/{id}:
 *   put:
 *     summary: Update a Warehouse
 *     tags: [Warehouses]
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
 *               sezione:
 *                 type: string
 *               foglio:
 *                 type: string
 *               particella:
 *                 type: string
 *               subalterno:
 *                 type: string
 *     responses:
 *       200:
 *         description: Warehouse updated
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
 * /warehouses/{id}:
 *   delete:
 *     summary: Delete a Warehouse
 *     tags: [Warehouses]
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

export { router as warehouseRouter };
