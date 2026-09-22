export {};

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
