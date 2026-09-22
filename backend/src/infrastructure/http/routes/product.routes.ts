import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaProductRepository } from '../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { PrismaWarehouseRepository } from '../../repositories/PrismaWarehouseRepository';
import { ProductController } from '../controllers/ProductController';
import { ProductMinistrySearchController } from '../controllers/ProductMinistrySearchController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';

const router = Router();
const productRepository = new PrismaProductRepository(prisma);
const stockRepository = new PrismaStockRepository(prisma);
const warehouseRepository = new PrismaWarehouseRepository(prisma);
const controller = new ProductController(
  productRepository,
  stockRepository,
  warehouseRepository,
  prisma,
);
const ministrySearchController = new ProductMinistrySearchController();

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product CRUD operations
 */

/**
 * @swagger
 * /products/me:
 *   get:
 *     summary: List all products across user's companies with verified stock history, warehouse name, and company info
 *     description: Returns products with only verified stocks (stocks without job or with job.isVerified=true)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyName
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter products by company name (case-insensitive partial match)
 *     responses:
 *       200:
 *         description: List of products with verified stocks only, warehouse name, company ID and company name
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
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           category:
 *                             type: string
 *                           principioAttivo:
 *                             type: string
 *                             nullable: true
 *                             description: Principio attivo estratto dall'etichetta del prodotto
 *                           warehouseId:
 *                             type: string
 *                           warehouse:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                               company:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: string
 *                                   name:
 *                                     type: string
 *                           stocks:
 *                             type: array
 *                             description: Only verified stocks (jobId is null or job.isVerified is true)
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 quantity:
 *                                   type: number
 *                                 type:
 *                                   type: string
 *                                 jobId:
 *                                   type: string
 *                                   nullable: true
 *                                 job:
 *                                   type: object
 *                                   nullable: true
 *                                   properties:
 *                                     isVerified:
 *                                       type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByUser(req, res)),
);

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new Product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: preview
 *         schema:
 *           type: boolean
 *         description: "If true, returns the parsed products with stock without importing."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyId
 *               - warehouseId
 *               - name
 *             properties:
 *               companyId:
 *                 type: string
 *               warehouseId:
 *                 type: string
 *               name:
 *                 type: string
 *               sku:
 *                 type: string
 *                 description: Optional. Default "N/A"
 *               barcode:
 *                 type: string
 *               category:
 *                 $ref: '#/components/schemas/ProductCategory'
 *                 description: Optional. Default "FERTILIZER"
 *               type:
 *                 type: string
 *                 description: Optional. Default "Generico"
 *               description:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               labelUrl:
 *                 type: string
 *               labelMetadata:
 *                 type: object
 *               stock:
 *                 type: object
 *                 description: Optional stock movement to create together with the product
 *                 required:
 *                   - quantity
 *                   - unitOfMeasureQuantity
 *                 properties:
 *                   quantity:
 *                     type: number
 *                   unitOfMeasureQuantity:
 *                     type: string
 *                   price:
 *                     type: number
 *                     description: Unit price (purchase cost for IN, sale price for OUT)
 *                   unitOfMeasurePrice:
 *                     type: string
 *                   type:
 *                     type: string
 *                     description: Optional. Default "IN"
 *                   ddtCode:
 *                     type: string
 *                   ddtDate:
 *                     type: string
 *                     format: date-time
 *                   ddtUrlFile:
 *                     type: string
 *                   invoiceCode:
 *                     type: string
 *                   invoiceDate:
 *                     type: string
 *                     format: date-time
 *                   invoiceDueDate:
 *                     type: string
 *                     format: date-time
 *                   invoiceUrlFile:
 *                     type: string
 *                   companySupplierName:
 *                     type: string
 *                   addressSupplier:
 *                     type: string
 *                   vatNumberSupplier:
 *                     type: string
 *     responses:
 *       201:
 *         description: Product created
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
 * /products/bulk:
 *   post:
 *     summary: Create multiple Products in the same warehouse (optional stock per product)
 *     tags: [Products]
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
 *               - warehouseId
 *               - products
 *             properties:
 *               companyId:
 *                 type: string
 *               warehouseId:
 *                 type: string
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                   properties:
 *                     name:
 *                       type: string
 *                     sku:
 *                       type: string
 *                       description: Optional. Default "N/A"
 *                     barcode:
 *                       type: string
 *                     category:
 *                       $ref: '#/components/schemas/ProductCategory'
 *                       description: Optional. Default "FERTILIZER"
 *                     type:
 *                       type: string
 *                       description: Optional. Default "Generico"
 *                     description:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     labelUrl:
 *                       type: string
 *                     labelMetadata:
 *                       type: object
 *                     stock:
 *                       type: object
 *                       description: Optional stock movement to create together with the product
 *                       required:
 *                         - quantity
 *                         - unitOfMeasureQuantity
 *                       properties:
 *                         quantity:
 *                           type: number
 *                         unitOfMeasureQuantity:
 *                           type: string
 *                         price:
 *                           type: number
 *                           description: Unit price (purchase cost for IN, sale price for OUT)
 *                         unitOfMeasurePrice:
 *                           type: string
 *                         type:
 *                           type: string
 *                           description: Optional. Default "IN"
 *                         ddtCode:
 *                           type: string
 *                         ddtDate:
 *                           type: string
 *                           format: date-time
 *                         ddtUrlFile:
 *                           type: string
 *                         invoiceCode:
 *                           type: string
 *                         invoiceDate:
 *                           type: string
 *                           format: date-time
 *                         invoiceDueDate:
 *                           type: string
 *                           format: date-time
 *                         invoiceUrlFile:
 *                           type: string
 *                         companySupplierName:
 *                           type: string
 *                         addressSupplier:
 *                           type: string
 *                         vatNumberSupplier:
 *                           type: string
 *     responses:
 *       201:
 *         description: Products created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/bulk',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.createBulk(req, res)),
);

/**
 * @swagger
 * /products/create-or-update-bulk:
 *   post:
 *     summary: Create or update products with stocks in bulk (JSON)
 *     description: "When product id is provided, that product is updated (must belong to the warehouse) and optional stock is added. When id is omitted, product is matched by name in the warehouse: if found, stock is added; if not, product and stock are created. Multiple items with the same name in the same request are treated as one product (no duplicates). warehouseId is optional; if omitted, the first warehouse for the company is used or a default is created."
 *     tags: [Products]
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
 *               - products
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: Company ID (required)
 *               warehouseId:
 *                 type: string
 *                 description: Warehouse ID (optional). If not provided, first available warehouse is used or default is created.
 *               products:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Optional. When provided, the existing product with this id is updated (must belong to the warehouse). Use this to update selected products.
 *                     name:
 *                       type: string
 *                       description: Product name (required)
 *                     sku:
 *                       type: string
 *                       description: SKU (optional, default "N/A")
 *                     barcode:
 *                       type: string
 *                     category:
 *                       $ref: '#/components/schemas/ProductCategory'
 *                       description: Optional. Default "FERTILIZER"
 *                     type:
 *                       type: string
 *                       description: Optional. Default "Generico"
 *                     description:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     labelUrl:
 *                       type: string
 *                     labelMetadata:
 *                       type: object
 *                     stock:
 *                       type: object
 *                       description: Optional stock movement to create
 *                       required:
 *                         - quantity
 *                         - unitOfMeasureQuantity
 *                       properties:
 *                         quantity:
 *                           type: number
 *                         unitOfMeasureQuantity:
 *                           type: string
 *                         price:
 *                           type: number
 *                           description: Unit price (purchase cost for IN, sale price for OUT)
 *                         unitOfMeasurePrice:
 *                           type: string
 *                         type:
 *                           type: string
 *                           description: Optional. Default "IN"
 *                         ddtCode:
 *                           type: string
 *                         ddtDate:
 *                           type: string
 *                           format: date-time
 *                         ddtUrlFile:
 *                           type: string
 *                         invoiceCode:
 *                           type: string
 *                         invoiceDate:
 *                           type: string
 *                           format: date-time
 *                         invoiceDueDate:
 *                           type: string
 *                           format: date-time
 *                         invoiceUrlFile:
 *                           type: string
 *                         companySupplierName:
 *                           type: string
 *                         addressSupplier:
 *                           type: string
 *                         vatNumberSupplier:
 *                           type: string
 *                         productNameAsOnDocument:
 *                           type: string
 *                           nullable: true
 *                           description: Product name as it appeared on the source document (DDT/invoice)
 *                         quantityConverted:
 *                           type: number
 *                           nullable: true
 *                           description: Quantity in canonical unit (kg or L) when applicable
 *                         unitMeasureConverted:
 *                           type: string
 *                           nullable: true
 *                           description: Canonical unit (kg or L) when conversion was applied
 *     responses:
 *       200:
 *         description: Products and stocks created or updated successfully
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
 *                     productsCreated:
 *                       type: number
 *                       description: Number of new products created
 *                     productsUpdated:
 *                       type: number
 *                       description: Number of existing products that received new stock
 *                     stocksCreated:
 *                       type: number
 *                       description: Number of stock entries created
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of errors encountered during processing
 *       400:
 *         description: Bad request (missing required fields, invalid data)
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/create-or-update-bulk',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.createOrUpdateBulk(req, res)),
);

/**
 * @swagger
 * /products/align-products:
 *   post:
 *     summary: Align (deduplicate) products by merging packaging variants
 *     description: >
 *       Receives a list of product IDs and merges variants of the same base product
 *       (e.g. "BISMARK da lt.10", "BISMARK da lt.5", "BISMARK da lt.1") into a single product.
 *       Stocks from duplicates are moved to the winner product with packaging info preserved in notes and packagingInfo fields.
 *       Product names are normalized to official fitosanitario denominations when available.
 *       Quantities in "pz" (pieces) are converted to real units based on packaging info in the name.
 *     tags: [Products]
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
 *               - productIds
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: Company ID (required)
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of product IDs to align
 *     responses:
 *       200:
 *         description: Products aligned successfully
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
 *                     groupsMerged:
 *                       type: number
 *                       description: Number of product groups that were merged
 *                     productsMerged:
 *                       type: number
 *                       description: Number of duplicate products merged into winners
 *                     stocksMoved:
 *                       type: number
 *                       description: Number of stock entries moved to winner products
 *                     productsDeleted:
 *                       type: number
 *                       description: Number of duplicate products deleted
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           baseName:
 *                             type: string
 *                           winnerId:
 *                             type: string
 *                           winnerName:
 *                             type: string
 *                           mergedProductIds:
 *                             type: array
 *                             items:
 *                               type: string
 *                           stocksMoved:
 *                             type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/align-products',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.alignProducts(req, res)),
);

/**
 * @swagger
 * /products/sync-labels:
 *   post:
 *     summary: Queue label metadata sync for products
 *     description: |
 *       Queues a background job to populate `labelMetadata` (principio attivo, formulazione,
 *       composizione, FRAC) on the user's pesticides/fertilizers. At least one of
 *       `companyId`, `warehouseId`, or `productIds` must be provided.
 *     tags: [Products]
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
 *               companyId:
 *                 type: string
 *               warehouseId:
 *                 type: string
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               forceRefresh:
 *                 type: boolean
 *                 description: Re-process products even if labelMetadata is already up-to-date
 *     responses:
 *       200:
 *         description: Job queued (or noop if no stale products)
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
 *                     jobId:
 *                       type: string
 *                       nullable: true
 *                     queued:
 *                       type: integer
 *       400:
 *         description: Bad request (missing filter)
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/sync-labels',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.syncLabels(req, res)),
);

/**
 * @swagger
 * /products/bulk:
 *   delete:
 *     summary: Delete multiple Products
 *     tags: [Products]
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
 *               - ids
 *             properties:
 *               companyId:
 *                 type: string
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       204:
 *         description: Products deleted
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.delete(
  '/bulk',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.deleteBulk(req, res)),
);

/**
 * @swagger
 * /products/bulk-from-ddt-to-product-list:
 *   post:
 *     summary: Extract product data from DDT files (PDF or images)
 *     description: Upload one or more DDT (Delivery Note) files (PDF, PNG, JPG, JPEG) and extract structured product information using AI. Maximum 10 files per request.
 *     tags: [Products]
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
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: DDT files to process (PDF, PNG, JPG, JPEG)
 *               ocrProvider:
 *                 type: string
 *                 enum: [mistral, openai]
 *                 default: mistral
 *                 description: OCR provider to use for document extraction
 *     responses:
 *       200:
 *         description: Successfully extracted product data from DDT files
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
 *                     suggestedProducts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productName:
 *                             type: string
 *                           productNameExtracted:
 *                             type: string
 *                             nullable: true
 *                             description: Name as extracted from the document (before normalization)
 *                           registrationNumber:
 *                             type: string
 *                             nullable: true
 *                           quantity:
 *                             type: number
 *                             nullable: true
 *                           quantityUnitOfMeasure:
 *                             type: string
 *                             nullable: true
 *                           quantityConverted:
 *                             type: number
 *                             nullable: true
 *                             description: Quantity converted to canonical unit (kg or L) when applicable
 *                           unitMeasureConverted:
 *                             type: string
 *                             nullable: true
 *                             description: Canonical unit after conversion (kg or L), or original unit if not converted
 *                           supplierName:
 *                             type: string
 *                             nullable: true
 *                           supplierVat:
 *                             type: string
 *                             nullable: true
 *                           ddtDate:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                             description: Delivery note date (Data di partenza) in ISO format (YYYY-MM-DD)
 *                           orderNumber:
 *                             type: string
 *                             nullable: true
 *                             description: Order number (Numero d'ordine)
 *                     totalEntries:
 *                       type: number
 *       400:
 *         description: No files provided or too many files (max 10)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Error during DDT extraction
 */
router.post(
  '/bulk-from-ddt-to-product-list',
  ensureAuthenticated,
  upload.array('files', 10),
  asyncHandler((req, res) => controller.bulkFromDdtToProductList(req, res)),
);

/**
 * @swagger
 * /products/bulk-from-invoice-to-product-list:
 *   post:
 *     summary: Extract product data from invoice files (PDF, XML FatturaPA, or images)
 *     description: Upload one or more invoice files (PDF, XML FatturaPA, PNG, JPG, JPEG) and extract structured product information. XML files are parsed directly; PDF and image files use AI extraction. Maximum 10 files per request.
 *     tags: [Products]
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
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Invoice files to process (PDF, XML FatturaPA, PNG, JPG, JPEG)
 *               ocrProvider:
 *                 type: string
 *                 enum: [mistral, openai]
 *                 default: mistral
 *                 description: OCR provider to use for document extraction
 *     responses:
 *       200:
 *         description: Successfully extracted product data from invoice files
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
 *                     suggestedProducts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productName:
 *                             type: string
 *                           productNameExtracted:
 *                             type: string
 *                             nullable: true
 *                             description: Name as extracted from the document (before normalization)
 *                           registrationNumber:
 *                             type: string
 *                             nullable: true
 *                           productCategory:
 *                             type: string
 *                             enum: [PHYTOSANITARY, FERTILIZER, OTHER]
 *                           quantity:
 *                             type: number
 *                             nullable: true
 *                           quantityUnitOfMeasure:
 *                             type: string
 *                             nullable: true
 *                           quantityConverted:
 *                             type: number
 *                             nullable: true
 *                             description: Quantity converted to canonical unit (kg or L) when applicable
 *                           unitMeasureConverted:
 *                             type: string
 *                             nullable: true
 *                             description: Canonical unit after conversion (kg or L), or original unit if not converted
 *                           supplierName:
 *                             type: string
 *                             nullable: true
 *                           supplierVat:
 *                             type: string
 *                             nullable: true
 *                           invoiceNumber:
 *                             type: string
 *                             nullable: true
 *                             description: Invoice number (Numero Fattura)
 *                           invoiceDate:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                             description: Invoice date (Data Fattura) in ISO format (YYYY-MM-DD)
 *                           invoiceDueDate:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                             description: Invoice due date (Scadenza fattura) in ISO format (YYYY-MM-DD)
 *                           unitPrice:
 *                             type: number
 *                             nullable: true
 *                           totalPrice:
 *                             type: number
 *                             nullable: true
 *                     totalEntries:
 *                       type: number
 *                     suggestedProductsWithStocks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           product:
 *                             type: object
 *                             properties:
 *                               productName:
 *                                 type: string
 *                               productNameExtracted:
 *                                 type: string
 *                                 nullable: true
 *                                 description: Name as extracted from the document (before normalization)
 *                               registrationNumber:
 *                                 type: string
 *                                 nullable: true
 *                               productCategory:
 *                                 type: string
 *                               administrativeStatus:
 *                                 type: string
 *                                 nullable: true
 *                           stocks:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 quantity:
 *                                   type: number
 *                                   nullable: true
 *                                 quantityUnitOfMeasure:
 *                                   type: string
 *                                   nullable: true
 *                                 quantityConverted:
 *                                   type: number
 *                                   nullable: true
 *                                   description: Quantity converted to canonical unit (kg or L) when applicable
 *                                 unitMeasureConverted:
 *                                   type: string
 *                                   nullable: true
 *                                   description: Canonical unit after conversion (kg or L), or original unit if not converted
 *                                 supplierName:
 *                                   type: string
 *                                   nullable: true
 *                                 supplierVat:
 *                                   type: string
 *                                   nullable: true
 *                                 invoiceNumber:
 *                                   type: string
 *                                   nullable: true
 *                                 invoiceDate:
 *                                   type: string
 *                                   format: date
 *                                   nullable: true
 *                                 invoiceDueDate:
 *                                   type: string
 *                                   format: date
 *                                   nullable: true
 *                                 unitPrice:
 *                                   type: number
 *                                   nullable: true
 *                                 totalPrice:
 *                                   type: number
 *                                   nullable: true
 *                     filesProcessed:
 *                       type: number
 *       400:
 *         description: No files provided or too many files (max 10)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Error during invoice extraction
 */
router.post(
  '/bulk-from-invoice-to-product-list',
  ensureAuthenticated,
  upload.array('files', 10),
  asyncHandler((req, res) => controller.bulkFromInvoiceToProductList(req, res)),
);

/**
 * @swagger
 * /products/import-from-csv-excel:
 *   post:
 *     summary: Import products and stocks from CSV or Excel file
 *     description: Upload a CSV or Excel file with product data. For each row, if the product name exists in the warehouse, only the stock is added. If the product doesn't exist, it is created along with the stock. If warehouseId is not provided, the first available warehouse for the company is used, or a default warehouse is created.
 *     tags: [Products]
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
 *               - companyId
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: "CSV or Excel file with columns: Nome prodotto, Quantità stock, Unità di misura stock, Prezzo, Tipo movimento (IN/OUT), Codice DDT, Data DDT, Scadenza fattura (SKU opzionale)"
 *               companyId:
 *                 type: string
 *                 description: Company ID (required)
 *               warehouseId:
 *                 type: string
 *                 description: Warehouse ID (optional). If not provided, first available warehouse is used or default is created.
 *     responses:
 *       200:
 *         description: Products and stocks imported successfully
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
 *                     productsCreated:
 *                       type: number
 *                       description: Number of new products created
 *                     productsUpdated:
 *                       type: number
 *                       description: Number of existing products that received new stock
 *                     stocksCreated:
 *                       type: number
 *                       description: Number of stock entries created
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of errors encountered during import
 *       400:
 *         description: Bad request (missing file, invalid data, etc.)
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/import-from-csv-excel',
  ensureAuthenticated,
  upload.single('file'),
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.importFromCsvExcel(req, res)),
);

/**
 * @swagger
 * /products/template:
 *   get:
 *     summary: Download CSV template for importing products and stocks
 *     description: Returns a CSV file template with all required and optional fields for Product and Stock entities. The template includes example values and instructions.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: CSV template file downloaded
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/template',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.downloadTemplate(req, res)),
);

/**
 * @swagger
 * /products/verified-phytosanitary:
 *   get:
 *     summary: List verified phytosanitary products (PESTICIDE category) that exist in fitosanitari database and are not revoked
 *     description: Returns products with category PESTICIDE that have a matching name in the official fitosanitari database and are not in revoked status. Can be filtered by companyId or returns all products from user's companies.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional company ID to filter products by specific company. If not provided, returns products from all user's companies.
 *     responses:
 *       200:
 *         description: List of verified phytosanitary products
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
 *                     products:
 *                       type: array
 *                       description: List of verified phytosanitary products
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           category:
 *                             type: string
 *                             example: PESTICIDE
 *                           registrationNumber:
 *                             type: string
 *                             nullable: true
 *                           administrativeStatus:
 *                             type: string
 *                             nullable: true
 *                           warehouse:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                               company:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: string
 *                                   name:
 *                                     type: string
 *                     totalProducts:
 *                       type: number
 *                       description: Total number of PESTICIDE products found
 *                     verifiedProducts:
 *                       type: number
 *                       description: Number of products verified and not revoked
 *                     revokedProducts:
 *                       type: number
 *                       description: Number of products found but revoked
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Fitosanitari file not found or internal error
 */
router.get(
  '/verified-phytosanitary',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listVerifiedPhytosanitaryProducts(req, res)),
);

/**
 * @swagger
 * /products/update-administrative-status:
 *   post:
 *     summary: Update administrative status for all products from fitosanitari database
 *     description: Reads the fitosanitari JSON file and updates the administrativeStatus field for all products that have a matching registrationNumber (num_registrazione).
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Administrative status updated successfully
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
 *                     productsUpdated:
 *                       type: number
 *                       description: Number of products updated
 *                     totalProductsWithRegistration:
 *                       type: number
 *                       description: Total number of products with registration number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Fitosanitari file not found or internal error
 */
router.post(
  '/update-administrative-status',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.updateAdministrativeStatus(req, res)),
);

/**
 * @swagger
 * /products/ministry-search:
 *   get:
 *     summary: Search Ministry phytosanitary products by name, active ingredient, or registration number
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: General search across product name, active ingredient, and registration number
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Product name filter
 *       - in: query
 *         name: registrationNumber
 *         schema:
 *           type: string
 *         description: Registration number filter
 *       - in: query
 *         name: activeIngredient
 *         schema:
 *           type: string
 *         description: Active ingredient filter
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 100
 *         description: Maximum number of products to return
 *     responses:
 *       200:
 *         description: Ministry product matches
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/ministry-search',
  ensureAuthenticated,
  asyncHandler((req, res) => ministrySearchController.search(req, res)),
);

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get Product by ID with warehouse name and company info
 *     description: Returns product with only verified stocks (stocks without job or with job.isVerified=true)
 *     tags: [Products]
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
 *         description: Product found with verified stocks only, warehouse name, company ID and company name
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
 *                     product:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         sku:
 *                           type: string
 *                         principioAttivo:
 *                           type: string
 *                           nullable: true
 *                           description: Principio attivo estratto dall'etichetta del prodotto
 *                         warehouseId:
 *                           type: string
 *                         warehouse:
 *                           type: object
 *                           properties:
 *                             name:
 *                               type: string
 *                             company:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 name:
 *                                   type: string
 *                         stocks:
 *                           type: array
 *                           items:
 *                             type: object
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
 * /products/warehouse/{warehouseId}:
 *   get:
 *     summary: List products by warehouse with verified stocks, warehouse name and company info
 *     description: Returns products with only verified stocks (stocks without job or with job.isVerified=true)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: warehouseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of products with verified stocks only, warehouse name, company ID and company name
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
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           sku:
 *                             type: string
 *                           principioAttivo:
 *                             type: string
 *                             nullable: true
 *                             description: Principio attivo estratto dall'etichetta del prodotto
 *                           warehouseId:
 *                             type: string
 *                           warehouse:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                               company:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: string
 *                                   name:
 *                                     type: string
 *                           stocks:
 *                             type: array
 *                             items:
 *                               type: object
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/warehouse/:warehouseId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByWarehouse(req, res)),
);

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update a Product
 *     description: All fields are optional; only provided fields are updated.
 *     tags: [Products]
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
 *               sku:
 *                 type: string
 *               barcode:
 *                 type: string
 *                 nullable: true
 *               category:
 *                 $ref: '#/components/schemas/ProductCategory'
 *               type:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               administrativeStatus:
 *                 type: string
 *                 nullable: true
 *               registrationNumber:
 *                 type: string
 *                 nullable: true
 *               labelUrl:
 *                 type: string
 *                 nullable: true
 *               labelMetadata:
 *                 type: object
 *                 nullable: true
 *               warehouseId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Product updated
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
 * /products/{id}:
 *   delete:
 *     summary: Delete a Product
 *     tags: [Products]
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

export { router as productRouter };
