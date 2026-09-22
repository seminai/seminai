export {};

/**
 * @openapi
 * /labels/extract-with-gpt/{id}:
 *   post:
 *     tags: [Labels]
 *     summary: Ri-estrae i dati di un'etichetta usando GPT-4o Vision con immagini ad alta risoluzione
 *     description: |
 *       Scarica il PDF dall'URL sorgente, lo elabora con GPT-4o Vision per estrarre testo e tabelle
 *       con alta precisione. Utilizza il testo già estratto con pdfToText come contesto per migliorare
 *       l'estrazione. Sovrascrive rawText con il testo migliorato e ri-estrae i dati strutturati.
 *       Richiede ruolo ADMIN o LABEL_MANAGER.
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID dell'etichetta da ri-estrarre con GPT Vision
 *     responses:
 *       200:
 *         description: Etichetta ri-estratta con successo usando GPT Vision
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
 *                       description: Testo migliorato estratto con GPT Vision
 *                     extractionConfidence:
 *                       type: integer
 *                     isVerified:
 *                       type: boolean
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
 *         description: Missing id o sourceUrl vuota
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 *       404:
 *         description: Label not found
 *       500:
 *         description: OPENAI_API_KEY non configurata
 */

/**
 * @openapi
 * /labels/bulk:
 *   delete:
 *     tags: [Labels]
 *     summary: Elimina in bulk etichette per lista di id
 *     description: Richiede ruolo ADMIN o LABEL_MANAGER
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ ids ]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
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
 *                     deleted:
 *                       type: integer
 *       400:
 *         description: Body malformato
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions (requires ADMIN or LABEL_MANAGER role)
 */

/**
 * @openapi
 * /labels/{id}/history:
 *   get:
 *     tags: [Labels]
 *     summary: Get label modification history
 *     description: Returns all modification history entries for a label, including user info
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Label history retrieved successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */

/**
 * @openapi
 * /labels/rollback/{historyId}:
 *   post:
 *     tags: [Labels]
 *     summary: Rollback a label to a previous state
 *     description: Restores a label to the state captured in a history entry. The rollback itself is recorded as a new history entry.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: historyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Label rolled back successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: History entry or label not found
 */
