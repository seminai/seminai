export {};

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
