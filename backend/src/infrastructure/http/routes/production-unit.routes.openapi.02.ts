export {};

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
