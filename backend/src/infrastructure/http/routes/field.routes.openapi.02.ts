export {};

/**
 * @swagger
 * /fields/extract:
 *   post:
 *     summary: Extract fields from Excel file without saving to database
 *     tags: [Fields]
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
 *                 description: Company id to attach extracted fields
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Fields extracted successfully
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
 *                         required:
 *                           - companyId
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           coordinates:
 *                             type: array
 *                             items:
 *                               type: number
 *                           city:
 *                             type: string
 *                           foglio:
 *                             type: string
 *                           particella:
 *                             type: string
 *                           superficieCatastaleMq:
 *                             type: number
 *                           gisHa:
 *                             type: number
 *                           sauHa:
 *                             type: number
 *                           uso:
 *                             type: string
 *                           sezione:
 *                             type: string
 *                           inizioConduzione:
 *                             type: string
 *                             format: date
 *                           fineConduzione:
 *                             type: string
 *                             format: date
 *                           address:
 *                             type: string
 *                           qualita:
 *                             type: string
 *                           soilType:
 *                             type: string
 *                           ph:
 *                             type: number
 *                           nitrogen:
 *                             type: number
 *                           phosphorus:
 *                             type: number
 *                           potassium:
 *                             type: number
 *                           calcium:
 *                             type: number
 *                           magnesium:
 *                             type: number
 *                           subalterno:
 *                             type: string
 *                           nation:
 *                             type: string
 *                           region:
 *                             type: string
 *                           cap:
 *                             type: string
 *                           variazioneMq:
 *                             type: string
 *                     extractedCount:
 *                       type: number
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /fields:
 *   get:
 *     summary: List fields across all companies for current user
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
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

/**
 * @swagger
 * /fields:
 *   post:
 *     summary: Create a new Field
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
 *               - companyId
 *               - name
 *               - address
 *               - sezione
 *               - foglio
 *               - particella
 *               - superficieCatastaleMq
 *             properties:
 *               companyId:
 *                 type: string
 *               name:
 *                 type: string
 *               coordinates:
 *                 type: array
 *                 items:
 *                   type: number
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               polygon:
 *                 type: object
 *               gisHa:
 *                 type: number
 *               sauHa:
 *                 type: number
 *               ph:
 *                 type: number
 *               nitrogen:
 *                 type: number
 *               phosphorus:
 *                 type: number
 *               potassium:
 *                 type: number
 *               calcium:
 *                 type: number
 *               magnesium:
 *                 type: number
 *               soilType:
 *                 type: string
 *               uso:
 *                 type: string
 *               qualita:
 *                 type: string
 *               superficieCatastaleMq:
 *                 type: number
 *               sezione:
 *                 type: string
 *               foglio:
 *                 type: string
 *               particella:
 *                 type: string
 *               subalterno:
 *                 type: string
 *               nation:
 *                 type: string
 *               region:
 *                 type: string
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               cap:
 *                 type: string
 *               variazioneMq:
 *                 type: string
 *               inizioConduzione:
 *                 type: string
 *                 format: date-time
 *               fineConduzione:
 *                 type: string
 *                 format: date-time
 *               bufferZoneNotes:
 *                 type: string
 *                 description: Note sulle fasce di rispetto e deriva (testo lungo)
 *     responses:
 *       201:
 *         description: Field created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
