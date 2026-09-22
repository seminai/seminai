import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { StockController } from '../controllers/StockController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';

const stockRouter = Router();
const stockRepository = new PrismaStockRepository(prisma);
const controller = new StockController(stockRepository);

/**
 * @swagger
 * tags:
 *   name: Stocks
 *   description: Stock movement operations
 */

/**
 * @swagger
 * /stocks:
 *   post:
 *     summary: Create a new Stock movement (positive or negative quantity)
 *     tags: [Stocks]
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
 *               - productId
 *               - quantity
 *               - unitOfMeasureQuantity
 *               - price
 *               - unitOfMeasurePrice
 *               - type
 *             properties:
 *               companyId:
 *                 type: string
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: number
 *                 description: positive for IN, negative for OUT
 *               unitOfMeasureQuantity:
 *                 type: string
 *               price:
 *                 type: number
 *                 description: Unit price (purchase cost for IN, sale price for OUT)
 *               unitOfMeasurePrice:
 *                 type: string
 *               type:
 *                 type: string
 *               ddtCode:
 *                 type: string
 *               ddtDate:
 *                 type: string
 *                 format: date-time
 *               ddtUrlFile:
 *                 type: string
 *               invoiceCode:
 *                 type: string
 *               invoiceDate:
 *                 type: string
 *                 format: date-time
 *               invoiceDueDate:
 *                 type: string
 *                 format: date-time
 *               invoiceUrlFile:
 *                 type: string
 *               companySupplierName:
 *                 type: string
 *               addressSupplier:
 *                 type: string
 *               vatNumberSupplier:
 *                 type: string
 *     responses:
 *       201:
 *         description: Stock created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
stockRouter.post(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.create(req, res)),
);

/**
 * @swagger
 * /stocks/{stockId}:
 *   patch:
 *     summary: Update a Stock movement
 *     tags: [Stocks]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: stockId
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
 *               companyId:
 *                 type: string
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: number
 *                 description: positive for IN, negative for OUT
 *               unitOfMeasureQuantity:
 *                 type: string
 *               price:
 *                 type: number
 *                 description: Unit price (purchase cost for IN, sale price for OUT)
 *               unitOfMeasurePrice:
 *                 type: string
 *               type:
 *                 type: string
 *               ddtCode:
 *                 type: string
 *               ddtDate:
 *                 type: string
 *                 format: date-time
 *               ddtUrlFile:
 *                 type: string
 *               invoiceCode:
 *                 type: string
 *               invoiceDate:
 *                 type: string
 *                 format: date-time
 *               invoiceDueDate:
 *                 type: string
 *                 format: date-time
 *               invoiceUrlFile:
 *                 type: string
 *               companySupplierName:
 *                 type: string
 *               addressSupplier:
 *                 type: string
 *               vatNumberSupplier:
 *                 type: string
 *               jobId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Stock updated
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Stock not found
 */
stockRouter.patch(
  '/:stockId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.update(req, res)),
);

/**
 * @swagger
 * /stocks/{stockId}:
 *   delete:
 *     summary: Delete a Stock movement
 *     description: Hard-deletes a stock movement. Refuses with 409 if the stock is linked to a verified job, to preserve treatment history.
 *     tags: [Stocks]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: stockId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company the stock belongs to (used for role check)
 *     responses:
 *       200:
 *         description: Stock deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions on the company
 *       404:
 *         description: Stock not found
 *       409:
 *         description: Stock is linked to a verified job and cannot be deleted
 */
stockRouter.delete(
  '/:stockId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.delete(req, res)),
);

export { stockRouter };

/**
 * @swagger
 * /stocks/{stockId}/upload:
 *   post:
 *     summary: Upload a file linked to a stock (DDT or Invoice)
 *     tags: [Stocks]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: stockId
 *         required: true
 *         schema:
 *           type: string
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
 *               fileType:
 *                 type: string
 *                 enum: [ddt, invoice]
 *     responses:
 *       200:
 *         description: File uploaded and stock updated
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
stockRouter.post(
  '/:stockId/upload',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  upload.single('file'),
  asyncHandler((req, res) => controller.upload(req, res)),
);
