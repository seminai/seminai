export {};

/**
 * @swagger
 * /fields/bulk:
 *   post:
 *     summary: Create multiple Fields (can belong to different companies)
 *     tags: [Fields]
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
 *               - fields
 *             properties:
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - companyId
 *                     - name
 *                     - address
 *                     - sezione
 *                     - foglio
 *                     - particella
 *                     - superficieCatastaleMq
 *                   properties:
 *                     companyId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     address:
 *                       type: string
 *                     sezione:
 *                       type: string
 *                     foglio:
 *                       type: string
 *                     particella:
 *                       type: string
 *                     superficieCatastaleMq:
 *                       type: number
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     coordinates:
 *                       type: array
 *                       items:
 *                         type: number
 *                     polygon:
 *                       type: object
 *                     gisHa:
 *                       type: number
 *                     sauHa:
 *                       type: number
 *                     inizioConduzione:
 *                       type: string
 *                       format: date
 *                     fineConduzione:
 *                       type: string
 *                       format: date
 *     responses:
 *       201:
 *         description: Fields created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /fields/{id}:
 *   get:
 *     summary: Get Field by ID (includes linked Production Units)
 *     tags: [Fields]
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
 *         description: Field found with full payload (coordinates, polygon, cadastral and agronomic data) and productionUnits
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
 *                     field:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         coordinates:
 *                           type: array
 *                           items:
 *                             type: number
 *                         latitude:
 *                           type: number
 *                           nullable: true
 *                         longitude:
 *                           type: number
 *                           nullable: true
 *                         polygon:
 *                           type: object
 *                           nullable: true
 *                         coordinatesGaussBoaga:
 *                           type: array
 *                           items:
 *                             type: number
 *                         polygonGaussBoaga:
 *                           type: object
 *                           nullable: true
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /fields/company/{companyId}:
 *   get:
 *     summary: List fields by company (includes linked Production Units)
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of fields with full payload (coordinates, polygon, cadastral and agronomic data) and productionUnits
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
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           latitude:
 *                             type: number
 *                             nullable: true
 *                           longitude:
 *                             type: number
 *                             nullable: true
 *                           polygon:
 *                             type: object
 *                             nullable: true
 *                           coordinatesGaussBoaga:
 *                             type: array
 *                             items:
 *                               type: number
 *                           polygonGaussBoaga:
 *                             type: object
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 */
