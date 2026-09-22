export {};

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
