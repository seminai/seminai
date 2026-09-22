export {};

/**
 * @swagger
 * tags:
 *   name: ProductionCycles
 *   description: Production cycles management for production units
 */

/**
 * @swagger
 * /production-units/{productionUnitId}/cycles:
 *   get:
 *     summary: List all cycles for a production unit
 *     description: Returns all production cycles (past, current, future) for a given production unit
 *     tags: [ProductionCycles]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: productionUnitId
 *         required: true
 *         schema:
 *           type: string
 *         description: The production unit ID
 *     responses:
 *       200:
 *         description: List of cycles
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
 *                     productionUnitId:
 *                       type: string
 *                     productionUnitName:
 *                       type: string
 *                     cycles:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           cropName:
 *                             type: string
 *                           cropType:
 *                             type: string
 *                           variety:
 *                             type: string
 *                           protocoll:
 *                             type: string
 *                           protectionStructure:
 *                             type: string
 *                           floweringDate:
 *                             type: string
 *                             format: date-time
 *                           harvestingDate:
 *                             type: string
 *                             format: date-time
 *                           occupazione:
 *                             type: string
 *                             nullable: true
 *                           destinazioneDiUso:
 *                             type: string
 *                             nullable: true
 *                           acquaTotalePeridoL:
 *                             type: number
 *                           seasonYear:
 *                             type: integer
 *                           cycleIndex:
 *                             type: integer
 *                           status:
 *                             type: string
 *                             enum: [past, current, future]
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     totalCycles:
 *                       type: integer
 *       404:
 *         description: Production unit not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /production-units/{productionUnitId}/cycles:
 *   post:
 *     summary: Create a new cycle for a production unit
 *     tags: [ProductionCycles]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: productionUnitId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cropName
 *               - cropType
 *               - variety
 *               - protocoll
 *               - protectionStructure
 *               - floweringDate
 *               - harvestingDate
 *             properties:
 *               cropName:
 *                 type: string
 *               cropType:
 *                 type: string
 *               variety:
 *                 type: string
 *               protocoll:
 *                 type: string
 *               protectionStructure:
 *                 type: string
 *               floweringDate:
 *                 type: string
 *                 format: date-time
 *               harvestingDate:
 *                 type: string
 *                 format: date-time
 *               occupazione:
 *                 type: string
 *                 nullable: true
 *               destinazioneDiUso:
 *                 type: string
 *                 nullable: true
 *               acquaTotalePeridoL:
 *                 type: number
 *                 default: 0
 *               seasonYear:
 *                 type: integer
 *                 description: If omitted, derived from floweringDate year
 *               cycleIndex:
 *                 type: integer
 *                 description: If omitted, auto-incremented for the season
 *     responses:
 *       201:
 *         description: Cycle created successfully
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
 *                     cycle:
 *                       type: object
 *       400:
 *         description: Validation error (dates out of range, etc.)
 *       404:
 *         description: Production unit not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /production-units/{productionUnitId}/cycles/{cycleId}:
 *   put:
 *     summary: Update an existing cycle
 *     tags: [ProductionCycles]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: productionUnitId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: cycleId
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
 *               cropName:
 *                 type: string
 *               cropType:
 *                 type: string
 *               variety:
 *                 type: string
 *               protocoll:
 *                 type: string
 *               protectionStructure:
 *                 type: string
 *               floweringDate:
 *                 type: string
 *                 format: date-time
 *               harvestingDate:
 *                 type: string
 *                 format: date-time
 *               occupazione:
 *                 type: string
 *                 nullable: true
 *               destinazioneDiUso:
 *                 type: string
 *                 nullable: true
 *               acquaTotalePeridoL:
 *                 type: number
 *               seasonYear:
 *                 type: integer
 *               cycleIndex:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Cycle updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Cycle not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /production-units/{productionUnitId}/cycles/{cycleId}:
 *   delete:
 *     summary: Delete a cycle
 *     description: Cannot delete the last cycle of a production unit
 *     tags: [ProductionCycles]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: productionUnitId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Cycle deleted successfully
 *       400:
 *         description: Cannot delete the last cycle
 *       404:
 *         description: Cycle not found
 *       401:
 *         description: Unauthorized
 */
