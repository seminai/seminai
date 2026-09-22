export {};

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
