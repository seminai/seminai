export {};

/**
 * @swagger
 * tags:
 *   name: Fields
 *   description: Field CRUD operations
 */

/**
 * @swagger
 * /fields/availability:
 *   get:
 *     summary: Get fields grouped by company with available area in date range
 *     tags: [Fields]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startAt
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for availability check (default is current date)
 *       - in: query
 *         name: endAt
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for availability check (default is one year from now)
 *     responses:
 *       200:
 *         description: List of companies with fields that have available area (full field payload included)
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
 *                     companies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           fields:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 name:
 *                                   type: string
 *                                 sauHa:
 *                                   type: number
 *                                 areaOccupied:
 *                                   type: number
 *                                 areaAvailable:
 *                                   type: number
 *                                 coordinates:
 *                                   type: array
 *                                   items:
 *                                     type: number
 *                                 latitude:
 *                                   type: number
 *                                   nullable: true
 *                                 longitude:
 *                                   type: number
 *                                   nullable: true
 *                                 polygon:
 *                                   type: object
 *                                   nullable: true
 *                                 gisHa:
 *                                   type: number
 *                                   nullable: true
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /fields/start-job-field-extraction:
 *   post:
 *     summary: Start a job to extract fields from Excel file
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
 *             properties:
 *               companyId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Job completed successfully with extracted fields (ready for bulk create)
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
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - companyId
 *                           - name
 *                           - address
 *                           - sezione
 *                           - foglio
 *                           - particella
 *                           - superficieCatastaleMq
 *                         properties:
 *                           companyId:
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
 *                           gisHa:
 *                             type: number
 *                             nullable: true
 *                           sauHa:
 *                             type: number
 *                             nullable: true
 *                           ph:
 *                             type: number
 *                             nullable: true
 *                           nitrogen:
 *                             type: number
 *                             nullable: true
 *                           phosphorus:
 *                             type: number
 *                             nullable: true
 *                           potassium:
 *                             type: number
 *                             nullable: true
 *                           calcium:
 *                             type: number
 *                             nullable: true
 *                           magnesium:
 *                             type: number
 *                             nullable: true
 *                           soilType:
 *                             type: string
 *                             nullable: true
 *                           uso:
 *                             type: string
 *                             nullable: true
 *                           qualita:
 *                             type: string
 *                             nullable: true
 *                           superficieCatastaleMq:
 *                             type: number
 *                             nullable: true
 *                           sezione:
 *                             type: string
 *                             nullable: true
 *                           foglio:
 *                             type: string
 *                             nullable: true
 *                           particella:
 *                             type: string
 *                             nullable: true
 *                           subalterno:
 *                             type: string
 *                             nullable: true
 *                           nation:
 *                             type: string
 *                             nullable: true
 *                           region:
 *                             type: string
 *                             nullable: true
 *                           city:
 *                             type: string
 *                             nullable: true
 *                           address:
 *                             type: string
 *                           cap:
 *                             type: string
 *                             nullable: true
 *                           variazioneMq:
 *                             type: string
 *                             nullable: true
 *                           inizioConduzione:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                           fineConduzione:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                     extractedCount:
 *                       type: number
 *       202:
 *         description: Job started but not finished yet (polling needed)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: accepted
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *       400:
 *         description: Missing file or companyId
 *       401:
 *         description: Unauthorized
 *       422:
 *         description: Job failed
 */
