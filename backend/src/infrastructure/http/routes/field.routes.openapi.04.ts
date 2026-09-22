export {};

/**
 * @swagger
 * /fields/bulk:
 *   put:
 *     summary: Update multiple Fields in bulk
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
 *                     - id
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     coordinates:
 *                       type: array
 *                       items:
 *                         type: number
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     polygon:
 *                       type: object
 *                     gisHa:
 *                       type: number
 *                     sauHa:
 *                       type: number
 *                     ph:
 *                       type: number
 *                     nitrogen:
 *                       type: number
 *                     phosphorus:
 *                       type: number
 *                     potassium:
 *                       type: number
 *                     calcium:
 *                       type: number
 *                     magnesium:
 *                       type: number
 *                     soilType:
 *                       type: string
 *                     uso:
 *                       type: string
 *                     qualita:
 *                       type: string
 *                     superficieCatastaleMq:
 *                       type: number
 *                     sezione:
 *                       type: string
 *                     foglio:
 *                       type: string
 *                     particella:
 *                       type: string
 *                     subalterno:
 *                       type: string
 *                     nation:
 *                       type: string
 *                     region:
 *                       type: string
 *                     city:
 *                       type: string
 *                     address:
 *                       type: string
 *                     cap:
 *                       type: string
 *                     variazioneMq:
 *                       type: string
 *                     inizioConduzione:
 *                       type: string
 *                       format: date-time
 *                     fineConduzione:
 *                       type: string
 *                       format: date-time
 *                     bufferZoneNotes:
 *                       type: string
 *                       description: Note sulle fasce di rispetto e deriva (testo lungo)
 *     responses:
 *       200:
 *         description: Fields updated successfully
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /fields/bulk:
 *   delete:
 *     summary: Delete multiple Fields in bulk
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
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of Field IDs to delete
 *     responses:
 *       204:
 *         description: Fields deleted successfully
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /fields/{id}:
 *   put:
 *     summary: Update a Field
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Field updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /fields/{id}:
 *   delete:
 *     summary: Delete a Field
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
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
