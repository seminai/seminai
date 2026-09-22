export {};

/**
 * @openapi
 * /labels/summary:
 *   get:
 *     tags: [Labels]
 *     summary: Elenco riassuntivo delle etichette disponibili
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       productName:
 *                         type: string
 *                       registrationNumber:
 *                         type: string
 *                       extractionConfidence:
 *                         type: integer
 *                       isVerified:
 *                         type: boolean
 *                       qualityExtraction:
 *                         type: array
 *                         items:
 *                           type: number
 *                       errors:
 *                         type: array
 *                         items:
 *                           type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */

/**
 * @openapi
 * /labels/bdf-label-detail:
 *   get:
 *     tags: [Labels]
 *     summary: Restituisce il dettaglio etichetta dal dataset BDF locale
 *     parameters:
 *       - in: query
 *         name: productName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: registrationNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Missing productName or registrationNumber
 *       404:
 *         description: Label non trovata nel dataset BDF
 */

/**
 * @openapi
 * /labels/bdf-label-list:
 *   get:
 *     tags: [Labels]
 *     summary: Elenco di productName e registrationNumber disponibili nel dataset BDF
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productName:
 *                         type: string
 *                       registrationNumber:
 *                         type: string
 */

/**
 * @openapi
 * /labels/by-product:
 *   get:
 *     tags: [Labels]
 *     summary: Dettaglio etichetta per nome prodotto e numero di registrazione
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: regNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Missing name or regNumber
 *       404:
 *         description: Label not found
 */

/**
 * @openapi
 * /labels/{id}:
 *   get:
 *     tags: [Labels]
 *     summary: Dettaglio etichetta per id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 *   put:
 *     tags: [Labels]
 *     summary: Aggiorna un'etichetta esistente per id
 *     description: Richiede ruolo ADMIN o LABEL_MANAGER
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
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
 *               productName:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               sourceUrl:
 *                 type: string
 *               label:
 *                 $ref: '#/components/schemas/Label'
 *               rawText:
 *                 type: string
 *               extractionConfidence:
 *                 type: integer
 *               extractedFields:
 *                 type: array
 *                 items:
 *                   type: string
 *               errors:
 *                 type: array
 *                 items:
 *                   type: string
 *               qualityExtraction:
 *                 type: array
 *                 items:
 *                   type: number
 *     responses:
 *       200:
 *         description: OK
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
 *                     id:
 *                       type: string
 *                     productName:
 *                       type: string
 *                     registrationNumber:
 *                       type: string
 *                     sourceUrl:
 *                       type: string
 *                     label:
 *                       $ref: '#/components/schemas/Label'
 *                     rawText:
 *                       type: string
 *                     extractionConfidence:
 *                       type: integer
 *                     extractedFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     qualityExtraction:
 *                       type: array
 *                       items:
 *                         type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing id
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 */
