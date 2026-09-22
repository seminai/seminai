export {};

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
