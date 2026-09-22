export {};

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
